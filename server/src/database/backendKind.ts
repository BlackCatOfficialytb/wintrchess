/**
 * Which storage backend the app should use.
 *
 * Selected once at startup from DB_TYPE: "sql" (or sqlite/mysql/postgresql)
 * picks the SQL document store, anything else - including unset - keeps the
 * historical MongoDB behaviour, so existing deployments are unaffected.
 */
export type DatabaseKind = "mongodb" | "sql";

const requested = process.env.DB_TYPE?.trim().toLowerCase();

export const DATABASE_KIND: DatabaseKind =
    requested == "sql"
        || requested == "sqlite"
        || requested == "mysql"
        || requested == "postgres"
        || requested == "postgresql"
        ? "sql"
        : "mongodb";