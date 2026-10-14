import type { Adapter, AdapterInstance } from "better-auth";

import {
    ObjectId, deleteDocument, readDocuments, writeDocument
} from "./sqlite";

// better-auth adapter over the sqlite document store. Model names come from
// the modelName options in lib/auth and match the table names that
// initSqlite creates, so no mapping layer is needed.

type WhereClause = {
    field: string;
    operator?: string;
    value: unknown;
    connector?: "AND" | "OR";
};

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

function matchesClause(
    id: string, doc: Record<string, any>, clause: WhereClause
): boolean {
    // better-auth addresses documents by their `id` property, which the
    // store keeps in the _id column rather than inside the document.
    const actual = clause.field == "id" ? id : doc[clause.field];
    const expected = clause.value;

    const equals = () =>
        actual === expected || String(actual) == String(expected);

    switch (clause.operator ?? "eq") {
        case "eq": return equals();
        case "ne": return !equals();
        case "lt": return compare(actual, expected) < 0;
        case "lte": return compare(actual, expected) <= 0;
        case "gt": return compare(actual, expected) > 0;
        case "gte": return compare(actual, expected) >= 0;
        case "in":
            return Array.isArray(expected)
                && expected.some(entry =>
                    actual === entry || String(actual) == String(entry)
                );
        case "contains":
            return String(actual ?? "").includes(String(expected));
        case "starts_with":
            return String(actual ?? "").startsWith(String(expected));
        case "ends_with":
            return String(actual ?? "").endsWith(String(expected));
        default:
            throw new Error(`unsupported where operator "${clause.operator}"`);
    }
}

function matchesWhere(
    id: string, doc: Record<string, any>, where?: WhereClause[]
): boolean {
    if (!where?.length) return true;

    // better-auth groups clauses by connector: every AND clause must hold
    // and at least one OR clause must hold (same as its mongo adapter's
    // {$and: [...], $or: [...]} query document).
    const andGroup = where.filter(
        clause => (clause.connector ?? "AND") == "AND"
    );
    const orGroup = where.filter(clause => clause.connector == "OR");

    if (andGroup.length
        && !andGroup.every(clause => matchesClause(id, doc, clause))) {
        return false;
    }

    if (orGroup.length
        && !orGroup.some(clause => matchesClause(id, doc, clause))) {
        return false;
    }

    return true;
}

function applyAuthUpdate(
    doc: Record<string, any>, update: Record<string, any>
): void {
    if (update.$set) {
        Object.assign(doc, update.$set);
        return;
    }

    for (const key of Object.keys(update)) {
        if (key.startsWith("$"))
            throw new Error(`unsupported update operator "${key}"`);
    }

    Object.assign(doc, update);
}

export const sqliteAuthAdapter: AdapterInstance = () => ({
    id: "sqlite-documents",

    create: async ({ model, data, forceAllowId }) => {
        const forced = forceAllowId
            ? (data as { id?: unknown }).id : undefined;
        const id = forced != null ? String(forced) : new ObjectId().hex;

        const doc = { ...data } as Record<string, any>;
        delete doc.id;

        writeDocument(model, id, doc);
        return { ...doc, id } as any;
    },

    findOne: async ({ model, where }) => {
        const hit = readDocuments(model).find(
            ({ id, doc }) => matchesWhere(id, doc, where)
        );

        return hit ? { ...hit.doc, id: hit.id } : null;
    },

    findMany: async ({ model, where, limit, offset, sortBy }) => {
        let found = readDocuments(model)
            .filter(({ id, doc }) => matchesWhere(id, doc, where));

        if (sortBy) {
            found = [...found].sort((left, right) => {
                const result = compare(
                    left.doc[sortBy.field], right.doc[sortBy.field]
                );
                return sortBy.direction == "desc" ? -result : result;
            });
        }

        if (offset) found = found.slice(offset);
        if (limit != null) found = found.slice(0, limit);

        return found.map(({ id, doc }) => ({ ...doc, id }));
    },

    count: async ({ model, where }) => readDocuments(model)
        .filter(({ id, doc }) => matchesWhere(id, doc, where)).length,

    update: async ({ model, where, update }) => {
        const hit = readDocuments(model).find(
            ({ id, doc }) => matchesWhere(id, doc, where)
        );

        if (!hit) return null;

        applyAuthUpdate(hit.doc, update);
        writeDocument(model, hit.id, hit.doc);
        return { ...hit.doc, id: hit.id };
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
}) as Adapter;
