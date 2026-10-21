import { createAdapterFactory } from "better-auth/adapters";

import {
    ObjectId, deleteDocument, readDocuments, writeDocument
} from "./sqlite";

// better-auth adapter over the sqlite document store. Model names come from
// the modelName options in lib/auth and match the table names that
// initSqlite creates, so no mapping layer is needed. Auth records keep their
// better-auth id in the _id column and never store a duplicate `id` field.

type WhereClause = {
    field: string;
    operator?: string;
    value: unknown;
    connector?: "AND" | "OR";
    mode?: "sensitive" | "insensitive";
};

function equals(
    actual: unknown, expected: unknown, insensitive = false
): boolean {
    if (expected === null) return actual == null;

    if (actual instanceof Date || expected instanceof Date) {
        return new Date(actual as any).getTime()
            == new Date(expected as any).getTime();
    }

    if (actual instanceof ObjectId || expected instanceof ObjectId)
        return String(actual) == String(expected);

    if (insensitive && typeof actual == "string"
        && typeof expected == "string") {
        return actual.toLowerCase() == expected.toLowerCase();
    }

    return actual === expected;
}

function compare(actual: unknown, expected: unknown): number {
    if (actual instanceof Date || expected instanceof Date) {
        return new Date(actual as any).getTime()
            - new Date(expected as any).getTime();
    }

    if (typeof actual == "number" && typeof expected == "number")
        return actual - expected;

    const a = String(actual ?? "");
    const b = String(expected ?? "");
    return a < b ? -1 : a > b ? 1 : 0;
}

function includes(
    actual: unknown, expected: unknown, insensitive: boolean
): boolean {
    const value = String(actual ?? "");
    const search = String(expected ?? "");

    return insensitive
        ? value.toLowerCase().includes(search.toLowerCase())
        : value.includes(search);
}

function matchesClause(
    id: string, doc: Record<string, any>, clause: WhereClause
): boolean {
    // better-auth addresses records by their `id` property, which the store
    // keeps in the _id column rather than inside the document.
    const actual = clause.field == "id" ? id : doc[clause.field];
    const expected = clause.value;
    const insensitive = clause.mode == "insensitive";

    switch (clause.operator ?? "eq") {
        case "eq": return equals(actual, expected, insensitive);
        case "ne": return !equals(actual, expected, insensitive);
        case "lt": return compare(actual, expected) < 0;
        case "lte": return compare(actual, expected) <= 0;
        case "gt": return compare(actual, expected) > 0;
        case "gte": return compare(actual, expected) >= 0;
        case "in":
            return Array.isArray(expected)
                && expected.some(entry =>
                    equals(actual, entry, insensitive)
                );
        case "not_in":
            return Array.isArray(expected)
                && !expected.some(entry =>
                    equals(actual, entry, insensitive)
                );
        case "contains":
            return includes(actual, expected, insensitive);
        case "starts_with": {
            const value = String(actual ?? "");
            const search = String(expected ?? "");
            return insensitive
                ? value.toLowerCase().startsWith(search.toLowerCase())
                : value.startsWith(search);
        }
        case "ends_with": {
            const value = String(actual ?? "");
            const search = String(expected ?? "");
            return insensitive
                ? value.toLowerCase().endsWith(search.toLowerCase())
                : value.endsWith(search);
        }
        default:
            throw new Error(`unsupported where operator "${clause.operator}"`);
    }
}

function matchesWhere(
    id: string, doc: Record<string, any>, where?: WhereClause[]
): boolean {
    if (!where?.length) return true;

    // Clauses are combined left to right, like better-auth's built-in
    // adapters: each clause's connector decides how it joins the result so
    // far.
    let result = matchesClause(id, doc, where[0]);

    for (let index = 1; index < where.length; index++) {
        const clause = where[index];
        const clauseResult = matchesClause(id, doc, clause);

        result = clause.connector == "OR"
            ? result || clauseResult
            : result && clauseResult;
    }

    return result;
}

function applyAuthUpdate(
    doc: Record<string, any>, update: Record<string, any>
): void {
    if (update.$set) {
        Object.assign(doc, update.$set);
        delete doc.id;
        return;
    }

    for (const key of Object.keys(update)) {
        if (key.startsWith("$"))
            throw new Error(`unsupported update operator "${key}"`);
    }

    Object.assign(doc, update);
    delete doc.id;
}

function withId(id: string, doc: Record<string, any>) {
    return { ...doc, id } as any;
}

export const sqliteAuthAdapter = createAdapterFactory({
    config: {
        adapterId: "sqlite-documents",
        adapterName: "SQLite Documents",
        usePlural: false,
        supportsDates: true,
        supportsJSON: true,
        supportsArrays: true,
        supportsBooleans: true,
        supportsNumericIds: false,
        transaction: false
    },

    adapter: () => ({
        create: async ({ model, data }) => {
            const values = { ...(data as Record<string, any>) };
            const id = values.id != null
                ? String(values.id) : new ObjectId().hex;

            delete values.id;

            writeDocument(model, id, values);
            return withId(id, values);
        },

        findOne: async ({ model, where }) => {
            const hit = readDocuments(model).find(
                ({ id, doc }) => matchesWhere(id, doc, where)
            );

            return hit ? withId(hit.id, hit.doc) : null;
        },

        findMany: async ({ model, where, limit, offset, sortBy }) => {
            let found = readDocuments(model)
                .filter(({ id, doc }) => matchesWhere(id, doc, where));

            if (sortBy) {
                found = [...found].sort((left, right) => {
                    const a = sortBy.field == "id"
                        ? left.id : left.doc[sortBy.field];
                    const b = sortBy.field == "id"
                        ? right.id : right.doc[sortBy.field];

                    const result = compare(a, b);
                    return sortBy.direction == "desc" ? -result : result;
                });
            }

            if (offset) found = found.slice(offset);
            if (limit != null) found = found.slice(0, limit);

            return found.map(({ id, doc }) => withId(id, doc));
        },

        count: async ({ model, where }) => readDocuments(model)
            .filter(({ id, doc }) => matchesWhere(id, doc, where)).length,

        update: async ({ model, where, update }) => {
            const hit = readDocuments(model).find(
                ({ id, doc }) => matchesWhere(id, doc, where)
            );

            if (!hit) return null;

            applyAuthUpdate(hit.doc, update as Record<string, any>);
            writeDocument(model, hit.id, hit.doc);
            return withId(hit.id, hit.doc);
        },

        updateMany: async ({ model, where, update }) => {
            let updated = 0;

            for (const hit of readDocuments(model)
                .filter(({ id, doc }) => matchesWhere(id, doc, where))) {
                applyAuthUpdate(hit.doc, update);
                writeDocument(model, hit.id, hit.doc);
                updated++;
            }

            return updated;
        },

        delete: async ({ model, where }) => {
            const hit = readDocuments(model).find(
                ({ id, doc }) => matchesWhere(id, doc, where)
            );

            if (hit) deleteDocument(model, hit.id);
        },

        deleteMany: async ({ model, where }) => {
            let deleted = 0;

            for (const hit of readDocuments(model)
                .filter(({ id, doc }) => matchesWhere(id, doc, where))) {
                if (deleteDocument(model, hit.id)) deleted++;
            }

            return deleted;
        }
    })
});
