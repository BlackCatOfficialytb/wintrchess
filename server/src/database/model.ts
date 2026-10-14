import { Schema, model as mongooseModel } from "mongoose";

import { sqliteModel } from "./sqlite";

export interface StoredId {
    toString(): string;
}

export type Doc<T> = T & {
    _id: StoredId;
    // mongoose's version key; type-level only, for call-site compatibility.
    __v: number;
    save(): Promise<void>;
    updateOne(update: Record<string, unknown>): Promise<void>;
    deleteOne(): Promise<void>;
};

interface QueryLike<T> extends PromiseLike<T> {
    lean(): this;
}

export interface FindOneQuery<T> extends QueryLike<Doc<T> | null> {}

export interface FindManyQuery<T> extends QueryLike<Doc<T>[]> {
    sort(spec: Record<string, "asc" | "desc" | 1 | -1>): this;
    skip(count: number): this;
    limit(count: number): this;
}

export interface ModelLike<T> {
    findOne(query?: Record<string, unknown>): FindOneQuery<T>;
    find(query?: Record<string, unknown>): FindManyQuery<T>;
    findById(id: string): FindOneQuery<T>;
    countDocuments(query?: Record<string, unknown>): Promise<number>;
    create(values: Record<string, any>): Promise<Doc<T>>;
    updateOne(
        query: Record<string, unknown>,
        update: Record<string, unknown>,
        options?: { upsert?: boolean }
    ): Promise<{ matchedCount: number; modifiedCount: number }>;
    deleteOne(query?: Record<string, unknown>): Promise<{ deletedCount: number }>;
    deleteMany(query?: Record<string, unknown>): Promise<{ deletedCount: number }>;
}

/**
 * Single entry point for the app's models. The backing implementation is
 * resolved lazily, because .env is only loaded after modules are imported.
 * DATABASE_DRIVER=sqlite selects the bundled document store; anything else
 * keeps the original mongoose behaviour.
 */
export function model<T>(
    name: string,
    schema: Schema<any>,
    collection: string
): ModelLike<T> {
    let implementation: ModelLike<T> | undefined;

    const resolve = () => implementation ??= (
        process.env.DATABASE_DRIVER == "sqlite"
            ? sqliteModel<T>(collection)
            : mongooseModel(name, schema, collection) as unknown as ModelLike<T>
    );

    return {
        findOne: query => resolve().findOne(query),
        find: query => resolve().find(query),
        findById: id => resolve().findById(id),
        countDocuments: query => resolve().countDocuments(query),
        create: values => resolve().create(values),
        updateOne: (query, update, options) =>
            resolve().updateOne(query, update, options),
        deleteOne: query => resolve().deleteOne(query),
        deleteMany: query => resolve().deleteMany(query)
    };
}
