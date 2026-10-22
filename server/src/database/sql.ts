import { randomBytes } from "crypto";

import Collection from "@/constants/Collection";
import type {
    Doc, FindManyQuery, FindOneQuery, ModelLike, StoredId
} from "./model";
import { createSqlBackend, type SqlBackend } from "./drivers";

// Document store over SQL. Every collection is one table:
// (_id TEXT PRIMARY KEY, doc TEXT) with the document serialised as JSON;
// dates, buffers and object ids are encoded as tagged objects so they survive
// the round trip. Queries only support what the app uses: equality, $in, and
// sorting/skip/limit for the news feed.
//
// SQLite is the default backend. Set DATABASE_URL to a mysql:/mariadb: or
// postgres:/postgresql: URL to use one of those servers instead; the table
// shape and the document encoding stay exactly the same.

let backend: SqlBackend | null = null;
let purgeTimer: NodeJS.Timeout | null = null;

// Analysis sessions expire 4 hours after creation.
const analysisSessionLifetime = 4 * 60 * 60 * 1000;

export interface StoredDocument {
    id: string;
    doc: Record<string, any>;
}

export function isDatabaseReady(): boolean {
    return backend != null;
}

export async function closeDatabase(): Promise<void> {
    if (purgeTimer) {
        clearInterval(purgeTimer);
        purgeTimer = null;
    }

    const current = backend;
    backend = null;
    await current?.close();
}

/**
 * Connect to the configured SQL backend and create the collection tables.
 *
 * Accepts a connection URL or, for compatibility with the original SQLite
 * implementation, a plain database path. Returns the backend name for logging.
 */
export async function initDatabase(
    url = process.env.DATABASE_URL
        || process.env.SQLITE_PATH
        || "data/wintrchess.db"
): Promise<string> {
    if (backend) return backend.label;

    const created = await createSqlBackend(url);
    backend = created;

    try {
        for (const collection of Object.values(Collection)) {
            await created.createTable(collection);
        }

        // None of the supported backends need a TTL index for this: the
        // number of active analysis sessions is small, and the same purge
        // loop works on every driver.
        await purgeExpiredAnalysisSessions();

        purgeTimer = setInterval(() => {
            purgeExpiredAnalysisSessions().catch(error => {
                console.error(
                    "failed to purge expired analysis sessions:", error
                );
            });
        }, 5 * 60_000);
        purgeTimer.unref();
    } catch (error) {
        backend = null;
        try {
            await created.close();
        } catch {
            // Keep the original startup error.
        }
        throw error;
    }

    return created.label;
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

function requireBackend(): SqlBackend {
    if (!backend) throw new Error("database not initialised.");
    return backend;
}

export async function readDocuments(
    collection: string
): Promise<StoredDocument[]> {
    const rows = await requireBackend().readAll(collection);

    return rows.map(row => ({
        id: row._id,
        doc: decode(JSON.parse(row.doc))
    }));
}

export async function writeDocument(
    collection: string, id: string, doc: Record<string, any>
): Promise<void> {
    const encoded = encode(doc) as Record<string, unknown>;
    delete encoded._id;

    await requireBackend().upsert(
        collection, id, JSON.stringify(encoded)
    );
}

export async function deleteDocument(
    collection: string, id: string
): Promise<boolean> {
    return requireBackend().delete(collection, id);
}

export async function purgeExpiredAnalysisSessions(): Promise<void> {
    const collection = Collection.ANALYSIS_SESSIONS;

    for (const { id, doc } of await readDocuments(collection)) {
        const createdAt = doc.createdAt
            ? new Date(doc.createdAt).getTime() : 0;

        if (Date.now() - createdAt > analysisSessionLifetime) {
            await deleteDocument(collection, id);
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

async function findHits(
    collection: string, query?: Record<string, unknown>
): Promise<StoredDocument[]> {
    return (await readDocuments(collection)).map(hit => {
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
                await writeDocument(collection, id, doc);
            }
        },
        updateOne: {
            value: async (update: Record<string, unknown>) => {
                applyUpdate(doc, update);
                await writeDocument(collection, id, doc);
            }
        },
        deleteOne: {
            value: async () => {
                await deleteDocument(collection, id);
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

    const execute = async () => {
        let hits = await findHits(collection, filter);

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

export function sqlModel<T>(collection: string): ModelLike<T> {
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
        countDocuments: async filter =>
            (await findHits(collection, filter)).length,

        create: async values => {
            const doc = { ...values };
            const id = values._id != null
                ? String(values._id) : new ObjectId().hex;

            await writeDocument(collection, id, doc);
            return attach<T>(collection, id, doc);
        },

        updateOne: async (filter, update, options) => {
            const hit = (await findHits(collection, filter))[0];

            if (hit) {
                applyUpdate(hit.doc, update);
                await writeDocument(collection, hit.id, hit.doc);
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

                await writeDocument(collection, id, seed);
            }

            return { matchedCount: 0, modifiedCount: 0 };
        },

        deleteOne: async filter => {
            const hit = (await findHits(collection, filter))[0];
            if (!hit) return { deletedCount: 0 };

            await deleteDocument(collection, hit.id);
            return { deletedCount: 1 };
        },

        deleteMany: async filter => {
            let deletedCount = 0;

            for (const hit of await findHits(collection, filter)) {
                if (await deleteDocument(collection, hit.id)) deletedCount++;
            }

            return { deletedCount };
        }
    };
}
