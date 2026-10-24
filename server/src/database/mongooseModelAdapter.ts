import mongoose from "mongoose";
import { ObjectId } from "mongodb";

import type {
    Doc, FindManyQuery, FindOneQuery, ModelLike, StoredId
} from "./model";

// Mongoose-backed implementation of the same document-model API the SQL store
// exposes, so the app's model layer runs unchanged on either backend. When
// DB_TYPE=sql these methods are unused; queries made here speak straight to
// the underlying collections of the connected mongoose database.

type RawDocument = Record<string, any>;

function requireCollection(collection: string) {
    const db = mongoose.connection.db;
    if (!db) throw new Error("database not initialised.");
    return db.collection(collection);
}

function isHexId(value: unknown): value is string {
    return typeof value == "string" && /^[0-9a-fA-F]{24}$/.test(value);
}

function toNativeId(value: unknown): unknown {
    if (isHexId(value)) return new ObjectId(value);
    return value;
}

function toNativeFilter(
    query?: Record<string, unknown>
): Record<string, unknown> {
    if (!query) return {};

    const native: Record<string, unknown> = {};

    for (const [field, expected] of Object.entries(query)) {
        if (expected && typeof expected == "object"
            && !(expected instanceof Date) && !Array.isArray(expected)
            && Object.keys(expected).some(key => key.startsWith("$"))) {
            const entries = (expected as { $in?: unknown }).$in;
            if (!Array.isArray(entries))
                throw new Error(`unsupported query operator on "${field}"`);

            native[field] = { $in: entries.map(toNativeId) };
            continue;
        }

        native[field] = toNativeId(expected);
    }

    return native;
}

function mongoSort(
    spec: Record<string, "asc" | "desc" | 1 | -1>
): Record<string, 1 | -1> {
    return Object.fromEntries(Object.entries(spec).map(
        ([field, direction]) => [
            field, direction == "desc" || direction == -1 ? -1 : 1
        ]
    ));
}

function applyUpdate(
    doc: RawDocument, update: Record<string, unknown>
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

async function writeBack(
    collection: string, id: unknown, doc: RawDocument
): Promise<void> {
    await requireCollection(collection).replaceOne(
        { _id: id } as any, doc as any, { upsert: true }
    );
}

function attach<T>(
    collection: string, id: unknown, doc: RawDocument
): Doc<T> {
    doc._id = id as unknown as StoredId;

    Object.defineProperties(doc, {
        save: {
            value: async () => {
                await writeBack(collection, id, doc);
            }
        },
        updateOne: {
            value: async (update: Record<string, unknown>) => {
                applyUpdate(doc, update);
                await writeBack(collection, id, doc);
            }
        },
        deleteOne: {
            value: async () => {
                await requireCollection(collection)
                    .deleteOne({ _id: id } as any);
            }
        }
    });

    return doc as unknown as Doc<T>;
}

async function findHits(
    collection: string,
    filter?: Record<string, unknown>,
    options: {
        sort?: Record<string, "asc" | "desc" | 1 | -1>;
        from?: number;
        count?: number;
    } = {}
): Promise<RawDocument[]> {
    let found = requireCollection(collection)
        .find(toNativeFilter(filter) as any);

    if (options.sort) found = found.sort(mongoSort(options.sort) as any);
    if (options.from) found = found.skip(options.from);
    if (options.count != null) found = found.limit(options.count);

    return await found.toArray() as RawDocument[];
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
        const hits = await findHits(collection, filter, { sort, from, count });

        const documents = hits.map(
            doc => attach<T>(collection, doc._id, doc)
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

export function mongooseModel<T>(collection: string): ModelLike<T> {
    return {
        findOne: filter =>
            query<T>(collection, "one", filter) as FindOneQuery<T>,
        find: filter =>
            query<T>(collection, "many", filter) as FindManyQuery<T>,
        findById: id => {
            return query<T>(
                collection, "one", { _id: toNativeId(id) }
            ) as FindOneQuery<T>;
        },
        countDocuments: async filter =>
            requireCollection(collection)
                .countDocuments(toNativeFilter(filter) as any),

        create: async values => {
            const doc: RawDocument = { ...(values as RawDocument) };
            const id = values._id != null
                ? toNativeId(values._id) : new ObjectId();
            delete doc._id;

            const stored = { ...doc, _id: id };
            const { insertedId } = await requireCollection(collection)
                .insertOne(stored as any);

            return attach<T>(collection, insertedId, stored);
        },

        updateOne: async (filter, update, options) => {
            const [hit] = await findHits(collection, filter);

            if (hit) {
                applyUpdate(hit, update);
                const { _id: id } = hit;
                await writeBack(collection, id, hit);
                return { matchedCount: 1, modifiedCount: 1 };
            }

            if (options?.upsert) {
                const seed: RawDocument = {};

                for (const [field, value] of Object.entries(filter ?? {})) {
                    const operatorField = value && typeof value == "object"
                        && !(value instanceof Date) && !Array.isArray(value)
                        && Object.keys(value).some(key => key.startsWith("$"));

                    if (!operatorField) seed[field] = toNativeId(value);
                }

                applyUpdate(seed, update);
                const id = seed._id != null
                    ? toNativeId(seed._id) : new ObjectId();
                const stored = { ...seed, _id: id };

                await requireCollection(collection).insertOne(stored as any);
            }

            return { matchedCount: 0, modifiedCount: 0 };
        },

        deleteOne: async filter => {
            const result = await requireCollection(collection)
                .deleteOne(toNativeFilter(filter) as any);

            return { deletedCount: result.deletedCount > 0 ? 1 : 0 };
        },

        deleteMany: async filter => {
            const result = await requireCollection(collection)
                .deleteMany(toNativeFilter(filter) as any);

            return { deletedCount: result.deletedCount };
        }
    };
}