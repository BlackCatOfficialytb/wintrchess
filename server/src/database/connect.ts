import cluster from "cluster";

import { initSqlite } from "@/database/sqlite";

function connectDatabase() {
    const first = cluster.worker?.id == 1;

    try {
        initSqlite(process.env.SQLITE_PATH || "data/wintrchess.db");
        if (first) console.log("sqlite database ready.");
    } catch (error) {
        if (!first) return;
        console.log("database connection failed:");
        console.log(error);
    }
}

export default connectDatabase;
