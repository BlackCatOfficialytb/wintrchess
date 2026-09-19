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

export const ENGINE_DOWNLOADS: EngineDownloadInfo[] = [
    {
        version: EngineVersion.STOCKFISH_19,
        label: "Stockfish 19 (68 MB)",
        jsUrl: `${BASE_URL}/stockfish-19-single.js`,
        wasmUrl: `${BASE_URL}/stockfish-19-single.wasm`,
        size: "68 MB",
        description: "Strongest version, multi-threaded, requires CORS headers"
    },
    {
        version: EngineVersion.STOCKFISH_19_MULTI,
        label: "Stockfish 19 Multi-threaded (68 MB)",
        jsUrl: `${BASE_URL}/stockfish-19.js`,
        wasmUrl: `${BASE_URL}/stockfish-19.wasm`,
        size: "68 MB",
        description: "Strongest version, multi-threaded, requires CORS headers"
    },
    {
        version: EngineVersion.STOCKFISH_19_LITE,
        label: "Stockfish 19 Lite (1.6 MB)",
        jsUrl: `${BASE_URL}/stockfish-19-lite-single.js`,
        wasmUrl: `${BASE_URL}/stockfish-19-lite-single.wasm`,
        size: "1.6 MB",
        description: "Lightweight, single-threaded, works without CORS"
    },
    {
        version: EngineVersion.STOCKFISH_19_LITE_MULTI,
        label: "Stockfish 19 Lite Multi-threaded (1.6 MB)",
        jsUrl: `${BASE_URL}/stockfish-19-lite.js`,
        wasmUrl: `${BASE_URL}/stockfish-19-lite.wasm`,
        size: "1.6 MB",
        description: "Lightweight, multi-threaded, requires CORS headers"
    },
    {
        version: EngineVersion.STOCKFISH_19_ASM,
        label: "Stockfish 19 ASM.js (3 MB)",
        jsUrl: `${BASE_URL}/stockfish-19-asm.js`,
        size: "3 MB",
        description: "JavaScript fallback, compatible with all browsers, slower"
    },
    {
        version: EngineVersion.LICHESS_19,
        label: "Stockfish 19 (Lichess Build)",
        jsUrl: `${BASE_URL}/stockfish-19-lichess-build.js`,
        wasmUrl: `${BASE_URL}/stockfish-19-lichess-build.wasm`,
        size: "~10 MB",
        description: "Official Stockfish 19 build from Lichess"
    },
    {
        version: EngineVersion.LICHESS_19_SMALLNET,
        label: "Stockfish 19 (Lichess Smallnet)",
        jsUrl: `${BASE_URL}/stockfish-19-lichess-build-smallnet.js`,
        wasmUrl: `${BASE_URL}/stockfish-19-lichess-build-smallnet.wasm`,
        size: "~5 MB",
        description: "Lichess build with size-optimized NNUE"
    }
];

export function getEngineDownloadInfo(version: EngineVersion): EngineDownloadInfo | undefined {
    return ENGINE_DOWNLOADS.find(d => d.version === version);
}

export function getAllEngineVersions(): EngineVersion[] {
    return ENGINE_DOWNLOADS.map(d => d.version);
}