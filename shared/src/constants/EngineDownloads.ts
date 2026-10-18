import EngineVersion from "./EngineVersion";

const BASE_URL = "/engines";

interface EngineDownloadInfo {
    version: EngineVersion;
    label: string;
    jsUrl: string;
    wasmUrl?: string;
    size: string;
    description: string;
}

// sizes = the js + wasm each download actually transfers (measured bytes
// from the nmrugg v19.0.1 release / npm "stockfish" package bin/)
export const ENGINE_DOWNLOADS: EngineDownloadInfo[] = [
    {
        version: EngineVersion.STOCKFISH_11,
        label: "Stockfish 11 (HCE) (1.3 MB)",
        jsUrl: `${BASE_URL}/stockfish-11.js`,
        wasmUrl: `${BASE_URL}/stockfish-11-hce.wasm`,
        size: "1.3 MB",
        description: "Classical Stockfish 11 with hand-crafted evaluation "
            + "(lichess-org/stockfish.wasm), no NNUE"
    },
    {
        version: EngineVersion.STOCKFISH_19,
        label: "Stockfish 19 (99.2 MB)",
        jsUrl: `${BASE_URL}/stockfish-19-full-single.js`,
        wasmUrl: `${BASE_URL}/stockfish-19-full-single.wasm`,
        size: "99.2 MB",
        description: "Strongest version, multi-threaded, requires CORS headers"
    },
    {
        version: EngineVersion.STOCKFISH_19_MULTI,
        label: "Stockfish 19 Multi-threaded (99.1 MB)",
        jsUrl: `${BASE_URL}/stockfish-19-full-multi.js`,
        wasmUrl: `${BASE_URL}/stockfish-19-full-multi.wasm`,
        size: "99.1 MB",
        description: "Strongest version, multi-threaded, requires CORS headers"
    },
    {
        version: EngineVersion.STOCKFISH_19_LITE,
        label: "Stockfish 19 Lite (1.9 MB)",
        jsUrl: `${BASE_URL}/stockfish-19-lite-single.js`,
        wasmUrl: `${BASE_URL}/stockfish-19-lite-single.wasm`,
        size: "1.9 MB",
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
        label: "Stockfish 19 Compatibility (3.2 MB)",
        jsUrl: `${BASE_URL}/stockfish-19-asm.js`,
        size: "3.2 MB",
        description: "JavaScript fallback, compatible with all browsers, slower"
    },
    {
        version: EngineVersion.LICHESS_19,
        label: "Stockfish 19 (Lichess Build) (0.6 MB)",
        jsUrl: `${BASE_URL}/stockfish-19-lichess-build.js`,
        wasmUrl: `${BASE_URL}/stockfish-19-lichess.wasm`,
        size: "0.6 MB",
        description: "Official Stockfish 19 build from Lichess"
    },
    {
        version: EngineVersion.LICHESS_19_SMALLNET,
        label: "Stockfish 19 (Lichess Smallnet) (0.5 MB)",
        jsUrl: `${BASE_URL}/stockfish-19-lichess-build-smallnet.js`,
        wasmUrl: `${BASE_URL}/stockfish-19-lichess-smallnet.wasm`,
        size: "0.5 MB",
        description: "Lichess build with size-optimized NNUE"
    }
];

export function getEngineDownloadInfo(version: EngineVersion): EngineDownloadInfo | undefined {
    return ENGINE_DOWNLOADS.find(d => d.version === version);
}

export function getAllEngineVersions(): EngineVersion[] {
    return ENGINE_DOWNLOADS.map(d => d.version);
}