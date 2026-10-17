// Boots every generated engine entry and asserts it answers UCI
// (uciok + readyok + bestmove). Companion to download-engines.mjs.
//
// Each entry runs on its own node:worker_threads thread: the classic engine
// blocks its thread in Atomics.wait while its pthread workers boot, which
// would otherwise freeze this process - and with it all timeouts. The parent
// only orchestrates: spawn, enforce a wall-clock budget, print the result.
import { mkdtemp, copyFile, readdir, writeFile, readFile, rm } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import vm from "node:vm";
import { isMainThread, parentPort, workerData, Worker as NodeWorker } from "node:worker_threads";

import { ENTRIES } from "./download-engines.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ENGINES_DIR = resolve(__dirname, "../public/engines");
const ENGINE_VERSION_FILE = resolve(__dirname, "../../shared/src/constants/EngineVersion.ts");
const PTHREAD_STUB = resolve(__dirname, "engine-pthread-stub.mjs");

const STEP_TIMEOUT = 60_000;
const ENTRY_TIMEOUT = 120_000;

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

// Every worker file shipped in EngineVersion must exist: either as a
// generated entry or as a self-contained payload (nmrugg v19 builds).
async function checkEnumMatches() {
    const source = await readFile(ENGINE_VERSION_FILE, "utf8");
    const versions = source.match(/"([^"]+\.js)"/g)?.map(value => value.slice(1, -1)) || [];
    const files = await readdir(ENGINES_DIR);

    const missing = versions.filter(version => (
        !(version in ENTRIES) && !files.includes(version)
    ));
    const unshipped = Object.keys(ENTRIES).filter(entry => !versions.includes(entry));

    assert(versions.length > 0, "no engine versions found in EngineVersion.ts");
    assert(!missing.length, `engine file missing (no entry, no payload): ${missing}`);
    assert(!unshipped.length, `worker entry not in EngineVersion: ${unshipped}`);
}

// A throwaway directory per entry, so ES module caching can't share one
// engine instance between two entries (Node caches modules per thread).
async function makeScratch(entry) {
    const files = await readdir(ENGINES_DIR);
    assert(files.includes(entry), `${entry} missing - run "npm run download-engines" first`);

    const scratch = await mkdtemp(join(tmpdir(), "wintrchess-engine-check-"));
    for (const file of files) {
        await copyFile(join(ENGINES_DIR, file), join(scratch, file));
    }

    // node treats .js as cjs unless the package says otherwise; classic
    // entries are only ever evaluated in a vm scope, so just the module
    // entries need esm semantics here
    if (!ENTRIES[entry].includes("importScripts")) {
        await writeFile(join(scratch, "package.json"), '{"type":"module"}');
    }

    return scratch;
}

function installGlobals(scratch, entry, lines) {
    globalThis.self = globalThis;
    globalThis.location = { href: pathToFileURL(join(scratch, entry)).href };
    globalThis.postMessage = message => {
        if (typeof message === "string") lines.push(message);
    };
    // emscripten routes pthread aborts through the main thread as alert()
    globalThis.alert = message => lines.push(String(message));

    // pthread pool: stockfish.worker.js runs on a real thread (the classic
    // engine blocks in Atomics.wait until it executes the thread entry), so
    // the handle only relays messages between emscripten and that thread.
    // outbound messages buffer until the stub signals its handler is up.
    globalThis.Worker = class {
        constructor(url) {
            const target = String(url);
            this.pending = [];
            this.ready = false;
            this.thread = new NodeWorker(PTHREAD_STUB, {
                workerData: {
                    workerScript: target.startsWith("file:") ? fileURLToPath(target) : target
                }
            });
            this.thread.on("message", data => {
                if (!this.ready && data?.ready) {
                    this.ready = true;
                    for (const queued of this.pending.splice(0)) this.thread.postMessage(queued);
                    return;
                }
                // deliver exactly once: emscripten also registers a node-style
                // listener next to onmessage ("on" below is a no-op for it)
                this.onmessage?.({ data });
            });
            this.thread.on("error", error => {
                console.error(`pthread stub failed: ${error}`);
                this.onerror?.({ error, message: String(error?.message ?? error) });
            });
        }

        postMessage(message, transfer) {
            const list = transfer?.length ? transfer : undefined;
            if (this.ready) this.thread.postMessage(message, list);
            else this.pending.push(message);
        }

        on() {}

        terminate() {
            this.thread.terminate();
        }
    };

    const realFetch = globalThis.fetch;
    globalThis.fetch = (input, init) => {
        const url = String(input);
        if (!url.startsWith("file:")) return realFetch(input, init);

        const body = readFileSync(fileURLToPath(url));
        return Promise.resolve(new Response(body, {
            headers: { "Content-Type": "application/wasm" }
        }));
    };

    return () => {
        globalThis.fetch = realFetch;
        delete globalThis.self;
        delete globalThis.location;
        delete globalThis.postMessage;
        delete globalThis.alert;
        delete globalThis.Worker;
        delete globalThis.importScripts;
        delete globalThis.onmessage;
        // vm var globals are non-configurable; Reflect keeps strict-mode delete quiet
        Reflect.deleteProperty(globalThis, "Stockfish");
    };
}

async function bootEntry(scratch, entry, lines) {
    const source = readFileSync(join(scratch, entry), "utf8");

    if (ENTRIES[entry].includes("importScripts")) {
        globalThis.importScripts = relativePath => {
            const path = resolve(dirname(join(scratch, entry)), relativePath);
            vm.runInThisContext(readFileSync(path, "utf8"), { filename: path });
        };

        vm.runInThisContext(source, { filename: join(scratch, entry) });
    } else {
        await import(pathToFileURL(join(scratch, entry)).href);
    }
}

function withTimeout(promise, label) {
    return new Promise((resolvePromise, reject) => {
        const timer = setTimeout(
            () => reject(new Error(`timed out waiting for ${label}`)),
            STEP_TIMEOUT
        );
        promise.then(
            value => { clearTimeout(timer); resolvePromise(value); },
            error => { clearTimeout(timer); reject(error); }
        );
    });
}

async function waitFor(lines, predicate, label) {
    const deadline = Date.now() + STEP_TIMEOUT;

    while (Date.now() < deadline) {
        const line = lines.find(predicate);
        if (line !== undefined) return line;

        await new Promise(res => setTimeout(res, 25));
    }

    throw new Error(
        `timed out waiting for ${label}\nlast output:\n`
        + lines.slice(-8).join("\n")
    );
}

// Per-entry check; runs on a dedicated worker thread (see the dispatch at
// the bottom of this file), where a wedged engine can only block itself.
async function runEntry(entry) {
    const lines = [];
    const scratch = await makeScratch(entry);

    try {
        const restore = installGlobals(scratch, entry, lines);
        try {
            await withTimeout(bootEntry(scratch, entry, lines), `${entry} boot`);

            // same command the app sends as soon as the worker exists
            globalThis.onmessage?.({ data: "uci" });
            await waitFor(lines, line => line.startsWith("uciok"), `${entry} uciok`);

            globalThis.onmessage?.({ data: "isready" });
            await waitFor(lines, line => line.startsWith("readyok"), `${entry} readyok`);

            globalThis.onmessage?.({ data: "setoption name Threads value 1" });
            globalThis.onmessage?.({ data: "position startpos" });
            globalThis.onmessage?.({ data: "go depth 8" });
            await waitFor(lines, line => line.startsWith("bestmove"), `${entry} bestmove`);
        } finally {
            restore();
        }
    } finally {
        await rm(scratch, { recursive: true, force: true });
    }
}

// Parent side: run one entry in a worker thread with a wall-clock budget -
// timers inside a blocked entry thread never fire, so this one must live
// on the parent's own event loop.
function checkEntry(entry) {
    return new Promise((resolveCheck, rejectCheck) => {
        const worker = new NodeWorker(fileURLToPath(import.meta.url), { workerData: { entry } });
        let settled = false;

        const settle = (error) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            worker.terminate();
            if (error) rejectCheck(error);
            else {
                console.log(`  \u2713 ${entry}`);
                resolveCheck();
            }
        };

        const timer = setTimeout(
            () => settle(new Error(`${entry}: engine thread stuck (no reply after ${ENTRY_TIMEOUT / 1000}s)`)),
            ENTRY_TIMEOUT
        );

        worker.on("message", message => {
            if (message.ok) settle();
            else settle(new Error(`${entry}: ${message.error}`));
        });
        worker.on("error", error => settle(
            error instanceof Error ? error : new Error(`${entry}: ${String(error)}`)
        ));
        worker.on("exit", code => settle(
            new Error(`${entry}: check thread exited with code ${code} before answering`)
        ));
    });
}

async function main() {
    console.log("Checking Stockfish engine entries...\n");

    await checkEnumMatches();

    const failures = [];
    for (const entry of Object.keys(ENTRIES)) {
        try {
            await checkEntry(entry);
        } catch (error) {
            failures.push(entry);
            console.error(`  \u2717 ${String(error.message || error).replace(/^/gm, "    ")}`);
        }
    }

    if (failures.length) {
        console.error(`\n\u2717 ${failures.length}/${Object.keys(ENTRIES).length} `
            + `engine entries failed: ${failures.join(", ")}`);
        process.exit(1);
    }

    console.log(`\n\u2713 ${Object.keys(ENTRIES).length} engine entries answered UCI`);

    // engines keep their event loops alive on purpose
    process.exit(0);
}

if (isMainThread) {
    main().catch(err => {
        console.error(`\n\u2717 ${err.message}`);
        process.exit(1);
    });
} else {
    runEntry(workerData.entry).then(
        () => parentPort.postMessage({ ok: true }),
        err => parentPort.postMessage({ ok: false, error: String(err?.stack || err?.message || err) })
    );
}
