import EngineVersion from "./EngineVersion";

const BASE_URL = "/engines";

export interface EngineDownloadFile {
    // same-origin path of one payload the engine needs to boot
    path: string;
    // byte count the build script installs; used for progress and labels
    sizeBytes: number;
}

export interface EngineDownloadInfo {
    version: EngineVersion;
    label: string;
    description: string;
    // every payload of the build (worker entry, factory, wasm, pthread
    // worker), mirroring what scripts/download-engines.mjs lays out
    files: EngineDownloadFile[];
}

function file(name: string, sizeBytes: number): EngineDownloadFile {
    return { path: `${BASE_URL}/${name}`, sizeBytes };
}

// ordered smallest first, so the downloads dialog lists the quick wins
// before the 99 MB builds
export const ENGINE_DOWNLOADS: EngineDownloadInfo[] = [
    {
        version: EngineVersion.STOCKFISH_19_LITE,
        label: "Stockfish 19 Lite (single-threaded)",
        description: "Lightweight NNUE build that runs on one thread",
        files: [
            file("stockfish-19-lite-single.js", 28230),
            file("stockfish-19-lite-single.wasm", 1845971)
        ]
    },
    {
        version: EngineVersion.STOCKFISH_19_LITE_MULTI,
        label: "Stockfish 19 Lite (multi-threaded)",
        description: "Lightweight NNUE build that uses multiple threads",
        files: [
            file("stockfish-19-lite-multi.js", 33426),
            file("stockfish-19-lite-multi.wasm", 1697617)
        ]
    },
    {
        version: EngineVersion.LICHESS_19_SMALLNET,
        label: "Stockfish 19 (Lichess smallnet)",
        description: "Official Lichess build with a size-optimized network",
        files: [
            file("stockfish-19-lichess-build-smallnet.js", 507),
            file("stockfish-19-lichess-smallnet.js", 28703),
            file("stockfish-19-lichess-smallnet.wasm", 516671)
        ]
    },
    {
        version: EngineVersion.LICHESS_19,
        label: "Stockfish 19 (Lichess build)",
        description: "Official Lichess build (stockfish-web)",
        files: [
            file("stockfish-19-lichess-build.js", 498),
            file("stockfish-19-lichess.js", 28640),
            file("stockfish-19-lichess.wasm", 587157)
        ]
    },
    {
        version: EngineVersion.STOCKFISH_11,
        label: "Stockfish 11 (HCE)",
        description: "Classical Stockfish 11 with hand-crafted evaluation",
        files: [
            file("stockfish-11.js", 476),
            file("stockfish-11-hce.js", 132488),
            file("stockfish-11-hce.wasm", 1337482),
            file("stockfish-11-hce.worker.js", 9380)
        ]
    },
    {
        version: EngineVersion.STOCKFISH_19_ASM,
        label: "Stockfish 19 (Compatibility)",
        description: "asm.js fallback for browsers without WebAssembly; much slower",
        files: [
            file("stockfish-19-asm.js", 3155627)
        ]
    },
    {
        version: EngineVersion.STOCKFISH_19,
        label: "Stockfish 19 (single-threaded)",
        description: "Full-strength NNUE build that runs on one thread",
        files: [
            file("stockfish-19-full-single.js", 28130),
            file("stockfish-19-full-single.wasm", 99169054)
        ]
    },
    {
        version: EngineVersion.STOCKFISH_19_MULTI,
        label: "Stockfish 19 (multi-threaded)",
        description: "Full-strength NNUE build that uses multiple threads; strongest option",
        files: [
            file("stockfish-19-full-multi.js", 33326),
            file("stockfish-19-full-multi.wasm", 99076105)
        ]
    }
];

export function getEngineDownloadInfo(version: EngineVersion): EngineDownloadInfo | undefined {
    return ENGINE_DOWNLOADS.find(download => download.version === version);
}

export function getEngineDownloadSize(info: EngineDownloadInfo): number {
    return info.files.reduce((total, file) => total + file.sizeBytes, 0);
}

// decimal megabytes, matching the sizes shown in the settings dropdown
export function formatEngineSize(sizeBytes: number): string {
    return `${(sizeBytes / 1e6).toFixed(1)} MB`;
}
