import { mkdir, copyFile, access } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = resolve(fileURLToPath(import.meta.url), "..");

const ENGINES_DIR = resolve(__dirname, "../public/engines");
const NODE_MODULES = resolve(__dirname, "../../node_modules");

const FILES_TO_COPY = [
    {
        src: resolve(NODE_MODULES, "@lichess-org/stockfish-web/sf_19.js"),
        dest: "stockfish-19-lichess-build.js"
    },
    {
        src: resolve(NODE_MODULES, "@lichess-org/stockfish-web/sf_19.wasm"),
        dest: "stockfish-19-lichess-build.wasm"
    },
    {
        src: resolve(NODE_MODULES, "@lichess-org/stockfish-web/sf_19_smallnet.js"),
        dest: "stockfish-19-lichess-build-smallnet.js"
    },
    {
        src: resolve(NODE_MODULES, "@lichess-org/stockfish-web/sf_19_smallnet.wasm"),
        dest: "stockfish-19-lichess-build-smallnet.wasm"
    },
    {
        src: resolve(NODE_MODULES, "stockfish.wasm/stockfish.js"),
        dest: "stockfish-19-single.js"
    },
    {
        src: resolve(NODE_MODULES, "stockfish.wasm/stockfish.wasm"),
        dest: "stockfish-19-single.wasm"
    },
    {
        src: resolve(NODE_MODULES, "stockfish.wasm/stockfish.js"),
        dest: "stockfish-19.js"
    },
    {
        src: resolve(NODE_MODULES, "stockfish.wasm/stockfish.wasm"),
        dest: "stockfish-19.wasm"
    },
    {
        src: resolve(NODE_MODULES, "stockfish.wasm/stockfish.js"),
        dest: "stockfish-19-lite-single.js"
    },
    {
        src: resolve(NODE_MODULES, "stockfish.wasm/stockfish.wasm"),
        dest: "stockfish-19-lite-single.wasm"
    },
    {
        src: resolve(NODE_MODULES, "stockfish.wasm/stockfish.js"),
        dest: "stockfish-19-lite.js"
    },
    {
        src: resolve(NODE_MODULES, "stockfish.wasm/stockfish.wasm"),
        dest: "stockfish-19-lite.wasm"
    },
    {
        src: resolve(NODE_MODULES, "@lichess-org/stockfish-web/sf_19.js"),
        dest: "stockfish-19-asm.js"
    }
];

async function copyIfExists(src, dest) {
    try {
        await access(src);
        await copyFile(src, dest);
        console.log(`  ✓ Copied: ${dest}`);
        return true;
    } catch {
        console.log(`  ✗ Missing: ${src}`);
        return false;
    }
}

async function main() {
    console.log("Copying Stockfish engines from node_modules...\n");

    await mkdir(ENGINES_DIR, { recursive: true });

    let successCount = 0;
    for (const { src, dest } of FILES_TO_COPY) {
        const destPath = resolve(ENGINES_DIR, dest);
        if (await copyIfExists(src, destPath)) {
            successCount++;
        }
    }

    console.log(`\n✓ Copied ${successCount}/${FILES_TO_COPY.length} engine files`);
    
    if (successCount === 0) {
        console.error("No engine files found. Run 'npm install' first.");
        process.exit(1);
    }
}

main().catch(err => {
    console.error("Error:", err.message);
    process.exit(1);
});