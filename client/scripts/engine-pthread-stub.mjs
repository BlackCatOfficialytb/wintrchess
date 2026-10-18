// Emulates a browser worker scope just enough to run the stockfish-11-hce
// build's stockfish-11-hce.worker.js inside a node:worker_threads Worker. check-engines.mjs
// uses this for the engine's pthread pool; a real browser loads the file
// directly as a classic worker.
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import vm from "node:vm";
import { parentPort, workerData } from "node:worker_threads";

const workerScript = workerData.workerScript;

globalThis.self = globalThis;
globalThis.location = { href: pathToFileURL(workerScript).href };
globalThis.importScripts = (...urls) => {
    for (const url of urls) {
        const file = url.startsWith("file:") ? fileURLToPath(url) : resolve(dirname(workerScript), url);
        vm.runInThisContext(readFileSync(file, "utf8"), { filename: file });
    }
};
globalThis.postMessage = message => parentPort.postMessage(message);

// the main thread buffers outgoing messages until this signal arrives, so the
// load handshake cannot race this worker's startup; messages posted after it
// are dispatched below via the worker script's own onmessage handler
parentPort.postMessage({ ready: true });
parentPort.on("message", data => globalThis.onmessage?.({ data }));

// stockfish-11-hce.worker.js has a native node branch (require/__filename) that
// would crash in a vm context - hide process so it takes the browser branch
globalThis.process = undefined;

vm.runInThisContext(readFileSync(workerScript, "utf8"), { filename: workerScript });
