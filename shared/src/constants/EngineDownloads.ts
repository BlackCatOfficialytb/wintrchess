import EngineVersion from "./EngineVersion";

const BASE_URL = "/engines";
const NNUE_BASE_URL = "/nnue";

interface EngineDownloadInfo {
    version: EngineVersion;
    label: string;
    jsUrl: string;
    wasmUrl?: string;
    // Lichess WebAssembly builds load their NNUE separately at runtime.
    nnueUrl?: string;
    size: string;
    description: string;
}

// Sizes are the bytes actually transferred - js + wasm + the decompressed
// NNUE net where one is used - expressed in MiB, matching the size shown in
// the downloads dialog. Lichess quotes net sizes the same way (132/94/1 MB).
export const ENGINE_DOWNLOADS: EngineDownloadInfo[] = [
    {
        version: EngineVersion.STOCKFISH_11,
        label: "Stockfish 11 (HCE) (1.4 MB)",
        jsUrl: `${BASE_URL}/stockfish-11.js`,
        wasmUrl: `${BASE_URL}/stockfish-11-hce.wasm`,
        size: "1.4 MB",
        description: "Classical Stockfish 11 with hand-crafted evaluation "
            + "(lichess-org/stockfish.wasm), no NNUE"
    },
    {
        version: EngineVersion.STOCKFISH_19,
        label: "Stockfish 19 (94.6 MB)",
        jsUrl: `${BASE_URL}/stockfish-19-full-single.js`,
        wasmUrl: `${BASE_URL}/stockfish-19-full-single.wasm`,
        size: "94.6 MB",
        description: "Strongest version, multi-threaded, requires CORS headers"
    },
    {
        version: EngineVersion.STOCKFISH_19_MULTI,
        label: "Stockfish 19 Multi-threaded (94.5 MB)",
        jsUrl: `${BASE_URL}/stockfish-19-full-multi.js`,
        wasmUrl: `${BASE_URL}/stockfish-19-full-multi.wasm`,
        size: "94.5 MB",
        description: "Strongest version, multi-threaded, requires CORS headers"
    },
    {
        version: EngineVersion.STOCKFISH_19_LITE,
        label: "Stockfish 19 Lite (1.8 MB)",
        jsUrl: `${BASE_URL}/stockfish-19-lite-single.js`,
        wasmUrl: `${BASE_URL}/stockfish-19-lite-single.wasm`,
        size: "1.8 MB",
        description: "Lightweight, single-threaded, works without CORS"
    },
    {
        version: EngineVersion.STOCKFISH_19_LITE_MULTI,
        label: "Stockfish 19 Lite Multi-threaded (1.7 MB)",
        jsUrl: `${BASE_URL}/stockfish-19-lite-multi.js`,
        wasmUrl: `${BASE_URL}/stockfish-19-lite-multi.wasm`,
        size: "1.7 MB",
        description: "Lightweight, multi-threaded, requires CORS headers"
    },
    {
        version: EngineVersion.STOCKFISH_19_ASM,
        label: "Stockfish 19 Compatibility (3.0 MB)",
        jsUrl: `${BASE_URL}/stockfish-19-asm.js`,
        size: "3.0 MB",
        description: "JavaScript fallback, compatible with all browsers, slower"
    },
    {
        version: EngineVersion.LICHESS_19,
        label: "Stockfish 19 (Lichess Build) (94.5 MB)",
        jsUrl: `${BASE_URL}/stockfish-19-lichess-build.js`,
        wasmUrl: `${BASE_URL}/stockfish-19-lichess.wasm`,
        nnueUrl: `${NNUE_BASE_URL}/nn-1a298aa575a0.nnue`,
        size: "94.5 MB",
        description: "Official Stockfish 19 build from Lichess, with NNUE net"
    },
    {
        version: EngineVersion.LICHESS_19_SMALLNET,
        label: "Stockfish 19 (Lichess Smallnet) (1.6 MB)",
        jsUrl: `${BASE_URL}/stockfish-19-lichess-build-smallnet.js`,
        wasmUrl: `${BASE_URL}/stockfish-19-lichess-smallnet.wasm`,
        nnueUrl: `${NNUE_BASE_URL}/nn-61e7af4bb97d.nnue`,
        size: "1.6 MB",
        description: "Lichess build with size-optimized NNUE"
    },
    {
        version: EngineVersion.SF_DEV,
        label: "Stockfish 20 dev",
        jsUrl: `${BASE_URL}/stockfish-dev.js`,
        wasmUrl: `${BASE_URL}/stockfish-dev-lichess.wasm`,
        nnueUrl: `${NNUE_BASE_URL}/nn-bddd9d57eb87.nnue`,
        size: "132.6 MB",
        description: "Latest Stockfish 20 development build from Lichess, "
            + "using NNUE nn-bddd9d57eb87"
    }
];

export function getEngineDownloadInfo(version: EngineVersion): EngineDownloadInfo | undefined {
    return ENGINE_DOWNLOADS.find(d => d.version === version);
}

export function getAllEngineVersions(): EngineVersion[] {
    return ENGINE_DOWNLOADS.map(d => d.version);
}
