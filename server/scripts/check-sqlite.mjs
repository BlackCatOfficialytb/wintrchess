// Runnable check for the SQL storage layer using its default SQLite backend.
// Run: npm run build -w server && npm run check-sqlite -w server
import { strict as assert } from "node:assert";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const scriptsDirectory = dirname(fileURLToPath(import.meta.url));
const distFile = join(scriptsDirectory, "..", "dist", "database", "sql.js");

if (!existsSync(distFile)) {
    console.error("dist is missing - run: npm run build -w server");
    process.exit(1);
}

const load = relative => import(
    pathToFileURL(join(scriptsDirectory, "..", "dist", "database", relative)).href
);

const {
    initDatabase, sqlModel, ObjectId, closeDatabase, purgeExpiredAnalysisSessions
} = await load("sql.js");
const { sqlAuthAdapter } = await load("sqlAuthAdapter.js");
const { default: Collection } = await import(
    pathToFileURL(join(scriptsDirectory, "..", "dist", "constants", "Collection.js")).href
);

const directory = mkdtempSync(join(tmpdir(), "wintrchess-sqlite-check-"));
const databasePath = join(directory, "check.db");
process.on("exit", () => {
    // Release the file handle before deleting (Windows locks open files).
    closeDatabase();
    rmSync(directory, { recursive: true, force: true });
});

await initDatabase(databasePath);

// --- ObjectId shim ---------------------------------------------------------
const generatedId = new ObjectId();
assert.equal(generatedId.toString().length, 24);
assert.equal(JSON.stringify({ id: generatedId }), `{"id":"${generatedId}"}`);
assert.equal(new ObjectId(generatedId.toString()).hex, generatedId.hex);
assert.throws(() => new ObjectId("not-a-hex-id"));

// --- documents: create, revive types, query -------------------------------
const games = sqlModel(Collection.ARCHIVED_GAMES);
// better-auth generates non-hex user ids, so archived games keep the string.
const userId = "better-auth-user-id-1234567890abcdef";

const game = await games.create({
    userId,
    date: "2026-01-01T00:00:00.000Z",
    gzippedStateTree: Buffer.from("gzip-bytes"),
    createdAt: new Date("2026-01-01T00:00:00.000Z")
});
assert.equal(game._id.toString().length, 24);

const foundGame = await games.findOne({ userId });
assert.ok(foundGame, "userId equality query should match");
assert.equal(foundGame.userId, userId);
assert.ok(foundGame.createdAt instanceof Date, "dates revive as Date");
assert.ok(Buffer.isBuffer(foundGame.gzippedStateTree), "buffers revive");
assert.equal(foundGame.gzippedStateTree.toString(), "gzip-bytes");
assert.equal(await games.countDocuments({ userId }), 1);
assert.equal(await games.findOne({ date: "nope" }), null);
assert.equal(
    (await games.findById(game._id.toString())).date,
    "2026-01-01T00:00:00.000Z"
);
assert.throws(() => games.findById("garbage"));

// --- instance methods ------------------------------------------------------
const sessions = sqlModel(Collection.ANALYSIS_SESSIONS);
const session = await sessions.create({
    token: "session-token", actions: 80, createdAt: new Date()
});

session.actions = 42;
await session.save();
assert.equal((await sessions.findOne({ token: "session-token" })).actions, 42);

await session.updateOne({ $set: { actions: 40 } });
assert.equal((await sessions.findOne({ token: "session-token" })).actions, 40);

await session.deleteOne();
assert.equal(await sessions.findOne({ token: "session-token" }), null);

// --- sorting, skipping, limiting, lean -------------------------------------
const news = sqlModel(Collection.NEWS_ARTICLES);
await news.create({ id: "a", timestamp: "2026-01-01" });
await news.create({ id: "b", timestamp: "2026-01-03" });
const third = await news.create({ id: "c", timestamp: "2026-01-02" });

const listed = await news.find()
    .sort({ timestamp: "desc" })
    .skip(1)
    .limit(1)
    .lean();
assert.equal(listed.length, 1);
assert.equal(listed[0].id, "c");

// --- updateOne: implicit $set, explicit $set, upsert -----------------------
await news.updateOne({ id: "a" }, { title: "renamed" });
assert.equal((await news.findOne({ id: "a" })).title, "renamed");

await news.updateOne({ id: "z" }, { $set: { title: "upserted" } }, { upsert: true });
assert.equal((await news.findOne({ id: "z" })).title, "upserted");

await assert.rejects(
    () => news.updateOne({ id: "a" }, { $inc: { views: 1 } }),
    /unsupported update operator/
);

// --- deleteOne, deleteMany ($in and unfiltered) ----------------------------
const deletion = await news.deleteMany({ _id: { $in: [third._id.toString()] } });
assert.equal(deletion.deletedCount, 1);
assert.equal(await news.findOne({ id: "c" }), null);

const announcements = sqlModel(Collection.ANNOUNCEMENT);
await announcements.create({ colour: "red", content: "hello" });
assert.equal((await announcements.deleteMany()).deletedCount, 1);

// --- durability across connections (cluster workers open separately) --------
const remaining = await news.findOne({ id: "a" });
const probe = new DatabaseSync(databasePath);
const persisted = probe
    .prepare(`SELECT doc FROM "${Collection.NEWS_ARTICLES}" WHERE _id = ?`)
    .get(String(remaining._id));
assert.ok(persisted, "documents survive in the sqlite file");
probe.close();

// --- analysis session expiry -----------------------------------------------
const expired = await sessions.create({
    token: "expired", actions: 80,
    createdAt: new Date(Date.now() - 5 * 60 * 60 * 1000)
});
await sessions.create({ token: "fresh", actions: 80, createdAt: new Date() });

await purgeExpiredAnalysisSessions();

assert.equal(await sessions.findOne({ token: expired.token }), null);
assert.ok(await sessions.findOne({ token: "fresh" }), "fresh sessions stay");

// --- better-auth adapter ---------------------------------------------------
const adapter = sqlAuthAdapter({
    user: { modelName: Collection.USERS },
    account: { modelName: Collection.ACCOUNTS },
    session: { modelName: Collection.SESSIONS },
    verification: { modelName: Collection.ACCOUNT_VERIFICATIONS }
});

const user = await adapter.create({
    model: Collection.USERS,
    data: {
        email: "check@example.com",
        name: "Checker",
        createdAt: new Date(),
        updatedAt: new Date()
    }
});
assert.equal(typeof user.id, "string");
assert.ok(user.id.length > 0);

const byId = await adapter.findOne({
    model: Collection.USERS,
    where: [{ field: "id", operator: "eq", value: user.id }]
});
assert.equal(byId.email, "check@example.com");
assert.ok(byId.createdAt instanceof Date, "auth dates revive");

const byEmail = await adapter.findOne({
    model: Collection.USERS,
    where: [{ field: "email", operator: "eq", value: "check@example.com" }]
});
assert.equal(byEmail.id, user.id);

const forced = await adapter.create({
    model: Collection.USERS,
    data: { id: "forced-auth-id", email: "forced@example.com" },
    forceAllowId: true
});
assert.equal(forced.id, "forced-auth-id");

await adapter.create({
    model: Collection.SESSIONS,
    data: {
        token: "expired-session",
        userId: user.id,
        expiresAt: new Date(Date.now() - 1000),
        createdAt: new Date()
    }
});
await adapter.create({
    model: Collection.SESSIONS,
    data: {
        token: "live-session",
        userId: user.id,
        expiresAt: new Date(Date.now() + 60_000),
        createdAt: new Date()
    }
});

assert.equal(await adapter.count({
    model: Collection.SESSIONS,
    where: [{ field: "expiresAt", operator: "gt", value: new Date() }]
}), 1, "gt on dates matches only unexpired sessions");

const sorted = await adapter.findMany({
    model: Collection.USERS,
    sortBy: { field: "email", direction: "desc" }
});
assert.equal(sorted[0].email, "forced@example.com");

const orHit = await adapter.findOne({
    model: Collection.USERS,
    where: [
        { field: "email", operator: "eq", value: "missing@example.com", connector: "OR" },
        { field: "email", operator: "eq", value: "check@example.com", connector: "OR" }
    ]
});
assert.ok(orHit, "OR group matches");

assert.equal(await adapter.count({
    model: Collection.USERS,
    where: [
        { field: "name", operator: "eq", value: "NotAName" },
        { field: "email", operator: "eq", value: "check@example.com" }
    ]
}), 0, "AND group must hold");

const renamed = await adapter.update({
    model: Collection.USERS,
    where: [{ field: "id", value: user.id }],
    update: { name: "Renamed" }
});
assert.equal(renamed.name, "Renamed");
assert.equal(renamed.id, user.id);

assert.equal(await adapter.count({
    model: Collection.USERS,
    where: [{ field: "id", operator: "in", value: [forced.id] }]
}), 1, "in operator");

assert.equal(await adapter.count({
    model: Collection.USERS,
    where: [{ field: "id", operator: "not_in", value: [forced.id] }]
}), 1, "not_in operator");

assert.equal(await adapter.count({
    model: Collection.USERS,
    where: [{ field: "email", operator: "starts_with", value: "check@" }]
}), 1, "starts_with operator");

assert.equal(await adapter.updateMany({
    model: Collection.SESSIONS,
    where: [{ field: "token", operator: "contains", value: "session" }],
    update: { userId: "someone-else" }
}), 2, "contains operator + updateMany");

assert.equal(await adapter.deleteMany({
    model: Collection.SESSIONS,
    where: [{ field: "token", operator: "contains", value: "session" }]
}), 2, "deleteMany");

await adapter.delete({
    model: Collection.USERS,
    where: [{ field: "id", value: user.id }]
});
assert.equal(await adapter.count({
    model: Collection.USERS,
    where: [{ field: "id", value: user.id }]
}), 0, "delete removes the record");

console.log("sql storage check passed (sqlite backend)");
