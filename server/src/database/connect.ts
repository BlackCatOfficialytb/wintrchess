import cluster from "cluster";
import mongoose from "mongoose";

import Collection from "@/constants/Collection";
import { DATABASE_KIND } from "@/database/backendKind";
import { initDatabase } from "@/database/sql";

async function initialiseIndexes() {
    const db = mongoose.connection.db;
    if (!db) throw new Error("failed to ensure database indexes.");

    await db.collection(Collection.ANALYSIS_SESSIONS).createIndex(
        { createdAt: 1 },
        { expireAfterSeconds: 14400 } // 4 hours
    );

    await db.collection(Collection.ARCHIVED_GAMES)
        .createIndex({ userId: 1 });
}

// The SQL store honours DATABASE_URL first; if only the legacy MongoDB-style
// DATABASE_URI is set but it happens to describe a SQL backend, use it, and
// otherwise fall back to SQLITE_PATH or the default file.
function sqlDatabaseUrl(): string {
    const explicit = process.env.DATABASE_URL;

    if (explicit) return explicit;

    const legacy = process.env.DATABASE_URI;
    if (legacy && !/^mongodb/i.test(legacy)) return legacy;

    return process.env.SQLITE_PATH || "data/wintrchess.db";
}

/**
 * Connect to the storage backend selected by DB_TYPE:
 * "sql" uses the SQLite/MySQL/PostgreSQL document store, anything else
 * (default) connects to MongoDB as before.
 */
async function connectDatabase() {
    const first = cluster.worker?.id == 1;

    try {
        if (DATABASE_KIND == "sql") {
            const label = await initDatabase(sqlDatabaseUrl());
            if (first) console.log(`${label.toLowerCase()} database ready.`);
        } else {
            await mongoose.connect(
                process.env.DATABASE_URI || "mongodb://database/wintrchess"
            );
            await initialiseIndexes();

            if (first) console.log("database connected successfully.");
        }
    } catch (error) {
        if (!first) return;

        console.log("database connection failed:");
        console.log(error);
    }
}

export default connectDatabase;