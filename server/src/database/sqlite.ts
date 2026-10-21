import { randomBytes } from "crypto";
import { mkdirSync } from "fs";
import { dirname } from "path";
import { DatabaseSync } from "node:sqlite";

import Collection from "@/constants/Collection";
import type {
    Doc, FindManyQuery, FindOneQuery, ModelLike, StoredId
} from "./model";

// Document store over node:sqlite. Every collection is one table:
// (_id TEXT PRIMARY KEY, doc TEXT) with the document serialised as JSON;
// dates, buffers and object ids are encoded as tagged objects so they survive
// the round trip. Queries only support what the app uses: equality, $in, and
// sorting/skip/limit for the news feed.

let database: DatabaseSync | null = null;

// Analysis sessions expire 4 hours after creation.
const analysisSessionLifetime = 4 * 60 * 60 * 1000;

export interface StoredDocument {
    id: string;
    doc: Record<string, any>;
}

export function isSqliteReady(): boolean {
    return database != null;
}

export function closeSqlite(): void {
    database?.close();
    database = null;
}

export function initSqlite(path: string): void {
    if (database) return;

    mkdirSync(dirname(path), { recursive: true });
    database = new DatabaseSync(path);

    // Cluster workers open the same file simultaneously; wait for locks
    // instead of failing, since switching to WAL briefly holds one.
    database.exec("PRAGMA busy_timeout = 5000");
    database.exec("PRAGMA journal_mode=WAL");

    for (const collection of Object.values(Collection)) {
        database.exec(
            `CREATE TABLE IF NOT EXISTS "${collection}"`
            + " (_id TEXT PRIMARY KEY, doc TEXT NOT NULL)"
        );
    }

    // SQLite has no TTL indexes, so expire analysis sessions with a timer.
    purgeExpiredAnalysisSessions();
    setInterval(purgeExpiredAnalysisSessions, 5 * 60_000).unref();
}

export class ObjectId {
    readonly hex: string;

    constructor(value?: string | ObjectId) {
        if (value == null) this.hex = randomBytes(12).toString("hex");
        else if (value instanceof ObjectId) this.hex = value.hex;
        else if (typeof value == "string" && /^[0-9a-fA-F]{24}$/.test(value))
            this.hex = value.toLowerCase();
        else throw new Error(`Cast to ObjectId failed for value: ${value}`);
    }

    toString(): string {
        return this.hex;
    }

    toHexString(): string {
        return this.hex;
    }

    toJSON(): string {
        return this.hex;
    }

    equals(other: unknown): boolean {
        return String(other) == this.hex;
    }
}

export const Types = { ObjectId };

function isObjectId(value: unknown): value is ObjectId {
    return value instanceof ObjectId;
}

function encode(value: any): any {
    if (isObjectId(value)) return { $oid: String(value) };
    if (value instanceof Date) return { $date: value.toISOString() };
    if (Buffer.isBuffer(value)) return { $bin: value.toString("base64") };

    if (Array.isArray(value)) return value.map(encode);

    if (typeof value == "object" && value != null) {
        return Object.fromEntries(
            Object.entries(value).map(
                ([key, entry]) => [key, encode(entry)]
            )
        );
    }

    return value;
}

function decode(value: unknown): any {
    if (Array.isArray(value)) return value.map(decode);

    if (typeof value == "object" && value != null) {
        const record = value as Record<string, unknown>;

        if (typeof record.$oid == "string") return new ObjectId(record.$oid);
        if (typeof record.$date == "string") return new Date(record.$date);
        if (typeof record.$bin == "string")
            return Buffer.from(record.$bin, "base64");

        return Object.fromEntries(
            Object.entries(record).map(([key, entry]) => [key, decode(entry)])
        );
    }

    return value;
}

function requireDatabase(): DatabaseSync {
    if (!database) throw new Error("sqlite database not initialised.");
    return database;
}

export function readDocuments(collection: string): StoredDocument[] {
    const rows = requireDatabase()
        .prepare(`SELECT _id, doc FROM "${collection}"`)
        .all() as { _id: string; doc: string }[];

    return rows.map(row => ({
        id: row._id,
        doc: decode(JSON.parse(row.doc))
    }));
}

export function writeDocument(
    collection: string, id: string, doc: Record<string, any>
): void {
    const encoded = encode(doc) as Record<string, unknown>;
    delete encoded._id;

    requireDatabase()
        .prepare(
            `INSERT INTO "${collection}" (_id, doc) VALUES (?, ?)`
            + " ON CONFLICT(_id) DO UPDATE SET doc = excluded.doc"
        )
        .run(id, JSON.stringify(encoded));
}

export function deleteDocument(collection: string, id: string): boolean {
    return requireDatabase()
        .prepare(`DELETE FROM "${collection}" WHERE _id = ?`)
        .run(id).changes > 0;
}

export function purgeExpiredAnalysisSessions(): void {
    const collection = Collection.ANALYSIS_SESSIONS;

    for (const { id, doc } of readDocuments(collection)) {
        const createdAt = doc.createdAt
            ? new Date(doc.createdAt).getTime() : 0;

        if (Date.now() - createdAt > analysisSessionLifetime) {
            deleteDocument(collection, id);
        }
    }
}

function isDate(value: unknown): value is Date {
    return (value as object) instanceof Date;
}

function matchesQuery(
    doc: Record<string, any>, query?: Record<string, unknown>
): boolean {
    if (!query) return true;

    return Object.entries(query).every(([field, expected]) => {
        const actual = doc[field];

        if (expected && typeof expected == "object"
            && !isDate(expected) && !Array.isArray(expected)
            && Object.keys(expected).some(key => key.startsWith("$"))) {
            const entries = (expected as { $in?: unknown }).$in;
            if (!Array.isArray(entries))
                throw new Error(`unsupported query operator on "${field}"`);

            return entries.some(entry => String(actual) == String(entry));
        }

        if (isObjectId(expected) || isObjectId(actual)) {
            return String(actual ?? "") == String(expected ?? "");
        }

        if (isDate(expected) || isDate(actual)) {
            return new Date(actual as any).getTime()
                == new Date(expected as any).getTime();
        }

        return actual === expected;
    });
}

function applyUpdate(
    doc: Record<string, any>, update: Record<string, unknown>
): void {
    const entries = Object.entries(update);

    // Plain objects are treated as an implicit $set, matching the app's
    // update calls that pass the new field values directly.
    if (!entries.some(([key]) => key.startsWith("$"))) {
        Object.assign(doc, update);
        return;
    }

    for (const [operator, payload] of entries) {
        if (operator == "$set") Object.assign(doc, payload);
        else throw new Error(`unsupported update operator "${operator}"`);
    }
}

function findHits(collection: string, query?: Record<string, unknown>) {
    return readDocuments(collection).map(hit => {
        // _id lives in its column, not in the stored document; queries
        // against it need it present before filtering.
        hit.doc._id = storedIdFor(hit.id);
        return hit;
    }).filter(({ doc }) => matchesQuery(doc, query));
}

function storedIdFor(id: string): StoredId {
    return /^[0-9a-fA-F]{24}$/.test(id) ? new ObjectId(id) : id;
}

function attach<T>(collection: string, id: string, doc: Record<string, any>): Doc<T> {
    // Ids that look like object ids keep the familiar 24-hex shape; auth
    // records use whatever id better-auth generated for them.
    doc._id = storedIdFor(id);

    Object.defineProperties(doc, {
        save: {
            value: async () => {
                writeDocument(collection, id, doc);
            }
        },
        updateOne: {
            value: async (update: Record<string, unknown>) => {
                applyUpdate(doc, update);
                writeDocument(collection, id, doc);
            }
        },
        deleteOne: {
            value: async () => {
                deleteDocument(collection, id);
            }
        }
    });

    return doc as Doc<T>;
}

function sortHits(
    hits: StoredDocument[],
    sort: Record<string, "asc" | "desc" | 1 | -1>
): StoredDocument[] {
    // Values are compared as strings, which is correct for the ISO-style
    // timestamps the app sorts on.
    return [...hits].sort((left, right) => {
        for (const [field, direction] of Object.entries(sort)) {
            const a = String(left.doc[field] ?? "");
            const b = String(right.doc[field] ?? "");
            if (a == b) continue;

            const descending = direction == "desc" || direction == -1;
            return (a < b ? -1 : 1) * (descending ? -1 : 1);
        }
        return 0;
    });
}

function query<T>(
    collection: string,
    kind: "one" | "many",
    filter?: Record<string, unknown>
): FindOneQuery<T> | FindManyQuery<T> {
    let sort: Record<string, "asc" | "desc" | 1 | -1> | undefined;
    let from = 0;
    let count: number | undefined;

    const execute = () => {
        let hits = findHits(collection, filter);

        if (sort) hits = sortHits(hits, sort);
        if (from) hits = hits.slice(from);
        if (count != null) hits = hits.slice(0, count);

        const documents = hits.map(
            ({ id, doc }) => attach<T>(collection, id, doc)
        );

        return kind == "one" ? (documents[0] ?? null) : documents;
    };

    const cursor: any = {
        lean: () => cursor,
        sort: (spec: Record<string, "asc" | "desc" | 1 | -1>) => {
            sort = spec;
            return cursor;
        },
        skip: (value: number) => {
            from = value;
            return cursor;
        },
        limit: (value: number) => {
            count = value;
            return cursor;
        },
        then: (onFulfilled?: any, onRejected?: any) =>
            Promise.resolve().then(execute).then(onFulfilled, onRejected)
    };

    return cursor;
}

export function sqliteModel<T>(collection: string): ModelLike<T> {
    return {
        findOne: filter =>
            query<T>(collection, "one", filter) as FindOneQuery<T>,
        find: filter =>
            query<T>(collection, "many", filter) as FindManyQuery<T>,
        findById: id => {
            return query<T>(
                collection, "one", { _id: new ObjectId(id) }
            ) as FindOneQuery<T>;
        },
        countDocuments: async filter => findHits(collection, filter).length,

        create: async values => {
            const doc = { ...values };
            const id = values._id != null
                ? String(values._id) : new ObjectId().hex;

            writeDocument(collection, id, doc);
            return attach<T>(collection, id, doc);
        },

        updateOne: async (filter, update, options) => {
            const hit = findHits(collection, filter)[0];

            if (hit) {
                applyUpdate(hit.doc, update);
                writeDocument(collection, hit.id, hit.doc);
                return { matchedCount: 1, modifiedCount: 1 };
            }

            if (options?.upsert) {
                const seed: Record<string, any> = {};

                for (const [field, value] of Object.entries(filter ?? {})) {
                    const operatorField = value && typeof value == "object"
                        && Object.keys(value as object)
                            .some(key => key.startsWith("$"));

                    if (!operatorField) seed[field] = value;
                }

                applyUpdate(seed, update);
                const id = seed._id != null
                    ? String(seed._id) : new ObjectId().hex;

                writeDocument(collection, id, seed);
            }

            return { matchedCount: 0, modifiedCount: 0 };
        },

        deleteOne: async filter => {
            const hit = findHits(collection, filter)[0];
            if (!hit) return { deletedCount: 0 };

            deleteDocument(collection, hit.id);
            return { deletedCount: 1 };
        },

        deleteMany: async filter => {
            let deletedCount = 0;

            for (const hit of findHits(collection, filter)) {
                if (deleteDocument(collection, hit.id)) deletedCount++;
            }

            return { deletedCount };
        }
    };
}
