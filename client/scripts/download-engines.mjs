import { mkdir, copyFile, access, writeFile, readFile, readdir, rm } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const ENGINES_DIR = resolve(__dirname, "../public/engines");
const NODE_MODULES = resolve(__dirname, "../../node_modules");

// Engine payloads. Dest names spell out each build's variant (engine,
// flavor, threads) per the "sf wasm link.txt" notes. Renames are safe:
// every payload resolves its .wasm (and its pthread workers) relative to
// its own file name - except the stockfish.wasm glue, which hardcodes both
// names and is patched below (PATCHES). stockfish/bin ships the real
// nmrugg v19.0.1 release builds (all five flavors) - those files double as
// their own worker entries.
const PAYLOADS = [
    // lichess-org/stockfish.wasm: Stockfish 11, classical HCE, threaded
    ["stockfish.wasm/stockfish.js", "stockfish-11-hce.js"],
    ["stockfish.wasm/stockfish.wasm", "stockfish-11-hce.wasm"],
    ["stockfish.wasm/stockfish.worker.js", "stockfish-11-hce.worker.js"],
    // nmrugg v19.0.1: full/lite x multi/single, plus asm-js
    ["stockfish/bin/stockfish-19.js", "stockfish-19-full-multi.js"],
    ["stockfish/bin/stockfish-19.wasm", "stockfish-19-full-multi.wasm"],
    ["stockfish/bin/stockfish-19-single.js", "stockfish-19-full-single.js"],
    ["stockfish/bin/stockfish-19-single.wasm", "stockfish-19-full-single.wasm"],
    ["stockfish/bin/stockfish-19-lite.js", "stockfish-19-lite-multi.js"],
    ["stockfish/bin/stockfish-19-lite.wasm", "stockfish-19-lite-multi.wasm"],
    ["stockfish/bin/stockfish-19-lite-single.js", "stockfish-19-lite-single.js"],
    ["stockfish/bin/stockfish-19-lite-single.wasm", "stockfish-19-lite-single.wasm"],
    ["stockfish/bin/stockfish-19-asm.js", "stockfish-19-asm.js"],
    // lichess-org/stockfish-web: default net / size-optimized smallnet
    ["@lichess-org/stockfish-web/sf_19.js", "stockfish-19-lichess.js"],
    ["@lichess-org/stockfish-web/sf_19.wasm", "stockfish-19-lichess.wasm"],
    ["@lichess-org/stockfish-web/sf_19_smallnet.js", "stockfish-19-lichess-smallnet.js"],
    ["@lichess-org/stockfish-web/sf_19_smallnet.wasm", "stockfish-19-lichess-smallnet.wasm"]
];

// Text payloads patched after copy; every replacement is global. The
// stockfish.wasm glue hardcodes its own wasm + pthread worker names, so the
// rename above has to follow through there; the lichess-web payloads
// reference their own names for the pthread respawn. The first
// stockfish.wasm patch is unrelated to naming: its pump only drains the
// proxied main-thread call queue when the main thread claims to be the
// *browser* main thread; in a worker emscripten registers that flag as
// false, so every proxied fd_write (all UCI output from search threads)
// deadlocks. Force the flag: the thread owns this worker's event loop
// either way.
const PATCHES = {
    "stockfish.wasm/stockfish.js": [
        [
            "__register_pthread_ptr(PThread.mainThreadBlock,!ENVIRONMENT_IS_WORKER,1)",
            "__register_pthread_ptr(PThread.mainThreadBlock,1,1)"
        ],
        ['"stockfish.wasm"', '"stockfish-11-hce.wasm"'],
        ['"stockfish.worker.js"', '"stockfish-11-hce.worker.js"']
    ],
    "@lichess-org/stockfish-web/sf_19.js": [
        ['"sf_19.wasm"', '"stockfish-19-lichess.wasm"'],
        ['"sf_19.js"', '"stockfish-19-lichess.js"']
    ],
    "@lichess-org/stockfish-web/sf_19_smallnet.js": [
        ['"sf_19_smallnet.wasm"', '"stockfish-19-lichess-smallnet.wasm"'],
        ['"sf_19_smallnet.js"', '"stockfish-19-lichess-smallnet.js"']
    ]
};

// Worker entries (one per EngineVersion): neither payload is a worker script
// by itself, so each entry bridges worker postMessage/UCI to the engine.
const CLASSIC_ENTRY = `
importScripts("./stockfish-11-hce.js");

// no document.currentScript in a worker scope, so emscripten cannot discover
// the factory url for its own pthread workers - hand it over explicitly.
const engine = Stockfish({
    mainScriptUrlOrBlob: new URL("stockfish-11-hce.js", self.location.href).href
});
engine.addMessageListener(line => postMessage(line));
self.onmessage = event => engine.postMessage(event.data);
`;

const moduleEntry = payload => `
import StockfishWeb from "./${payload}";

const queued = [];
self.onmessage = event => queued.push(String(event.data));

// listen is a callback property read at output time; passing it up front
// registers it before any UCI output can flow
const engine = await StockfishWeb({ listen: line => postMessage(line) });
for (const command of queued) engine.uci(command);

self.onmessage = event => engine.uci(String(event.data));
`;

const ENTRIES = {
    // wraps the stockfish-11-hce payload (lichess-org/stockfish.wasm,
    // Stockfish 11 with hand-crafted evaluation)
    "stockfish-11.js": CLASSIC_ENTRY,
    // the nmrugg v19.0.1 builds (stockfish-19-*.js) are self-contained worker
    // scripts - no generated entry needed, the payload file is the entry
    "stockfish-19-lichess-build.js": moduleEntry("stockfish-19-lichess.js"),
    "stockfish-19-lichess-build-smallnet.js": moduleEntry("stockfish-19-lichess-smallnet.js")
};

const GENERATED_HEADER = "// generated by scripts/download-engines.mjs - do not edit\n";

async function main() {
    console.log("Installing Stockfish engines...\n");

    await mkdir(ENGINES_DIR, { recursive: true });

    let copied = 0;
    for (const [source, destName] of PAYLOADS) {
        const src = resolve(NODE_MODULES, source);
        const dest = resolve(ENGINES_DIR, destName);
        const patches = PATCHES[source];

        try {
            await access(src);
            if (patches) {
                let content = await readFile(src, "utf8");
                for (const [from, to] of patches) {
                    if (!content.includes(from)) {
                        console.error(`  \u2717 Patch miss in ${source}: ${from}`);
                        process.exit(1);
                    }
                    content = content.split(from).join(to);
                }
                await writeFile(dest, content);
            } else {
                await copyFile(src, dest);
            }
            console.log(`  \u2713 Copied: ${dest}`);
            copied++;
        } catch {
            console.log(`  \u2717 Missing: ${src}`);
        }
    }

    for (const [name, source] of Object.entries(ENTRIES)) {
        const dest = resolve(ENGINES_DIR, name);
        await writeFile(dest, GENERATED_HEADER + source.trimStart());
        console.log(`  \u2713 Wrote:  ${dest}`);
    }

    // remove payloads left over from earlier naming schemes so the folder
    // only ever mirrors the list above
    const expected = new Set([
        ...PAYLOADS.map(([, destName]) => destName),
        ...Object.keys(ENTRIES),
        ".gitkeep"
    ]);
    for (const file of await readdir(ENGINES_DIR)) {
        if (expected.has(file)) continue;
        await rm(resolve(ENGINES_DIR, file), { force: true });
        console.log(`  - Removed stale: ${file}`);
    }

    console.log(`\n\u2713 Installed ${copied}/${PAYLOADS.length} engine payloads, `
        + `${Object.keys(ENTRIES).length} worker entries`);

    if (copied !== PAYLOADS.length) {
        console.error("Some engine payloads are missing. Run 'npm install' first.");
        process.exit(1);
    }
}

export { ENTRIES };

// run only when invoked directly (check-engines.mjs imports ENTRIES)
const invokedDirectly = process.argv[1]
    && fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (invokedDirectly) {
    main().catch(err => {
        console.error("Error:", err.message);
        process.exit(1);
    });
}
