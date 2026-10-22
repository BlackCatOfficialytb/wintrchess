import cluster from "cluster";

import { initDatabase } from "@/database/sql";

async function connectDatabase() {
    const first = cluster.worker?.id == 1;

    try {
        const label = await initDatabase();
        if (first) console.log(`${label.toLowerCase()} database ready.`);
    } catch (error) {
        if (!first) return;
        console.log("database connection failed:");
        console.log(error);
    }
}

export default connectDatabase;
