import { mkdirSync } from "fs";
import { dirname } from "path";
import { fileURLToPath } from "url";
import { DatabaseSync } from "node:sqlite";

// The app stores every collection in its own table with the same two columns:
// (_id TEXT PRIMARY KEY, doc TEXT NOT NULL). Each backend only needs to
// create those tables, read every row, upsert a document and delete by id;
// filtering, sorting and updates happen in sql.ts on the decoded documents.
//
// Keeping the schema this small means the same store works on SQLite,
// MySQL/MariaDB and PostgreSQL without a query builder or an ORM.

export interface StoredRow {
    _id: string;
    doc: string;
}

export interface SqlBackend {
    readonly label: string;
    createTable(collection: string): Promise<void>;
    readAll(collection: string): Promise<StoredRow[]>;
    upsert(collection: string, id: string, doc: string): Promise<void>;
    delete(collection: string, id: string): Promise<boolean>;
    close(): Promise<void>;
}

function quoteDouble(identifier: string): string {
    return `"${identifier.replace(/"/g, "\"\"")}"`;
}

function quoteBacktick(identifier: string): string {
    return `\`${identifier.replace(/`/g, "``")}\``;
}

class SqliteBackend implements SqlBackend {
    readonly label = "SQLite";

    private readonly database: DatabaseSync;

    constructor(path: string) {
        mkdirSync(dirname(path), { recursive: true });
        this.database = new DatabaseSync(path);

        // Cluster workers open the same file simultaneously; wait for locks
        // instead of failing, since switching to WAL briefly holds one.
        this.database.exec("PRAGMA busy_timeout = 5000");
        this.database.exec("PRAGMA journal_mode=WAL");
    }

    async createTable(collection: string): Promise<void> {
        this.database.exec(
            `CREATE TABLE IF NOT EXISTS ${quoteDouble(collection)}`
            + " (_id TEXT PRIMARY KEY, doc TEXT NOT NULL)"
        );
    }

    async readAll(collection: string): Promise<StoredRow[]> {
        return this.database.prepare(
            `SELECT _id, doc FROM ${quoteDouble(collection)}`
        ).all() as StoredRow[];
    }

    async upsert(collection: string, id: string, doc: string): Promise<void> {
        this.database.prepare(
            `INSERT INTO ${quoteDouble(collection)} (_id, doc) VALUES (?, ?)`
            + " ON CONFLICT(_id) DO UPDATE SET doc = excluded.doc"
        ).run(id, doc);
    }

    async delete(collection: string, id: string): Promise<boolean> {
        return this.database.prepare(
            `DELETE FROM ${quoteDouble(collection)} WHERE _id = ?`
        ).run(id).changes > 0;
    }

    async close(): Promise<void> {
        this.database.close();
    }
}

class MysqlBackend implements SqlBackend {
    readonly label = "MySQL";

    private constructor(private readonly pool: import("mysql2/promise").Pool) {}

    static async create(url: string): Promise<MysqlBackend> {
        const { createPool } = await import("mysql2/promise");
        const parsed = new URL(url);
        const database = decodeURIComponent(
            parsed.pathname.replace(/^\//, "")
        );

        if (!database)
            throw new Error("MySQL DATABASE_URL must include a database name.");

        return new MysqlBackend(createPool({
            host: parsed.hostname.replace(/^\[|\]$/g, ""),
            port: parsed.port ? Number(parsed.port) : 3306,
            user: decodeURIComponent(parsed.username),
            password: decodeURIComponent(parsed.password),
            database,
            connectionLimit: 5,
            charset: "utf8mb4"
        }));
    }

    async createTable(collection: string): Promise<void> {
        // utf8mb4_bin keeps _id comparisons byte-exact, like the other
        // backends, instead of using a case-insensitive collation.
        await this.pool.query(
            `CREATE TABLE IF NOT EXISTS ${quoteBacktick(collection)}`
            + " (_id VARCHAR(255) CHARACTER SET utf8mb4"
            + " COLLATE utf8mb4_bin PRIMARY KEY, doc LONGTEXT NOT NULL)"
            + " CHARACTER SET utf8mb4 COLLATE utf8mb4_bin"
        );
    }

    async readAll(collection: string): Promise<StoredRow[]> {
        const [rows] = await this.pool.query(
            `SELECT _id, doc FROM ${quoteBacktick(collection)}`
        );

        return rows as unknown as StoredRow[];
    }

    async upsert(collection: string, id: string, doc: string): Promise<void> {
        await this.pool.query(
            `INSERT INTO ${quoteBacktick(collection)} (_id, doc) VALUES (?, ?)`
            + " ON DUPLICATE KEY UPDATE doc = VALUES(doc)",
            [id, doc]
        );
    }

    async delete(collection: string, id: string): Promise<boolean> {
        const [result] = await this.pool.query(
            `DELETE FROM ${quoteBacktick(collection)} WHERE _id = ?`,
            [id]
        );

        return (result as { affectedRows: number }).affectedRows > 0;
    }

    async close(): Promise<void> {
        await this.pool.end();
    }
}

class PostgresBackend implements SqlBackend {
    readonly label = "PostgreSQL";

    private constructor(private readonly pool: import("pg").Pool) {}

    static async create(url: string): Promise<PostgresBackend> {
        const { Pool } = await import("pg");
        const pool = new Pool({ connectionString: url, max: 5 });

        pool.on("error", error => {
            console.error("postgres pool error:", error);
        });

        // Fail during startup rather than on the first request.
        try {
            await pool.query("SELECT 1");
        } catch (error) {
            await pool.end();
            throw error;
        }

        return new PostgresBackend(pool);
    }

    async createTable(collection: string): Promise<void> {
        const sql = `CREATE TABLE IF NOT EXISTS ${quoteDouble(collection)}`
            + " (_id TEXT PRIMARY KEY, doc TEXT NOT NULL)";

        // Cluster workers create the schema at the same time. PostgreSQL can
        // surface the losing side of that race as a duplicate pg_type or
        // relation error even with IF NOT EXISTS; retry until the winner's
        // table is visible.
        for (let attempt = 0; ; attempt++) {
            try {
                await this.pool.query(sql);
                return;
            } catch (error) {
                const code = (error as { code?: string }).code;
                const raced = code == "23505" || code == "42P07";

                if (!raced || attempt >= 4) throw error;
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }
    }

    async readAll(collection: string): Promise<StoredRow[]> {
        const result = await this.pool.query(
            `SELECT _id, doc FROM ${quoteDouble(collection)}`
        );

        return result.rows as StoredRow[];
    }

    async upsert(collection: string, id: string, doc: string): Promise<void> {
        await this.pool.query(
            `INSERT INTO ${quoteDouble(collection)} (_id, doc) VALUES ($1, $2)`
            + " ON CONFLICT (_id) DO UPDATE SET doc = EXCLUDED.doc",
            [id, doc]
        );
    }

    async delete(collection: string, id: string): Promise<boolean> {
        const result = await this.pool.query(
            `DELETE FROM ${quoteDouble(collection)} WHERE _id = $1`,
            [id]
        );

        return (result.rowCount ?? 0) > 0;
    }

    async close(): Promise<void> {
        await this.pool.end();
    }
}

function sqlitePath(value: string): string {
    if (value.toLowerCase().startsWith("file://")) return fileURLToPath(value);

    // Only URL forms are percent-decoded; a plain Windows path may legally
    // contain a percent sign.
    const isUrl = /^(?:sqlite|file):/i.test(value);
    const path = isUrl
        ? decodeURIComponent(value.replace(/^(?:sqlite|file):(?:\/\/)?/i, ""))
        : value;

    if (!path) throw new Error("SQLite database path is empty.");

    // sqlite:///C:/... leaves a leading slash after the scheme is stripped.
    return /^\/[A-Za-z]:[\\/]/.test(path) ? path.slice(1) : path;
}

/**
 * Create the backend described by DATABASE_URL.
 *
 * Plain paths (and sqlite:/file: URLs) use SQLite, mysql:/mariadb: URLs use
 * MySQL, and postgres:/postgresql: URLs use PostgreSQL.
 */
export async function createSqlBackend(url: string): Promise<SqlBackend> {
    const value = url.trim();
    if (!value) throw new Error("database URL is empty.");

    const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(value)?.[1].toLowerCase();

    // A single letter is a Windows drive (C:\...), not a URL scheme.
    const protocol = scheme && scheme.length > 1 ? scheme : undefined;

    switch (protocol) {
        case "mysql":
        case "mariadb":
            return MysqlBackend.create(value);

        case "postgres":
        case "postgresql":
            return PostgresBackend.create(value);

        case "sqlite":
        case "file":
        case undefined:
            return new SqliteBackend(sqlitePath(value));

        default:
            throw new Error(
                `unsupported database URL scheme "${protocol}". `
                + "Use sqlite:, mysql: or postgres:."
            );
    }
}
