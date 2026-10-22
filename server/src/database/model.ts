import { sqlModel } from "./sql";

export interface StoredId {
    toString(): string;
}

export type Doc<T> = T & {
    _id: StoredId;
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
    create(values: T & { _id?: string | StoredId }): Promise<Doc<T>>;
    updateOne(
        query: Record<string, unknown>,
        update: Record<string, unknown>,
        options?: { upsert?: boolean }
    ): Promise<{ matchedCount: number; modifiedCount: number }>;
    deleteOne(query?: Record<string, unknown>): Promise<{ deletedCount: number }>;
    deleteMany(query?: Record<string, unknown>): Promise<{ deletedCount: number }>;
}

/**
 * Single entry point for the app's models, backed by the SQL document store.
 */
export function model<T>(collection: string): ModelLike<T> {
    return sqlModel<T>(collection);
}
