// runtime engine download manager: mirrors the stockfish payloads listed in
// shared EngineDownloads into the Cache Storage API so repeat visits boot
// the engines straight from disk - even offline. public/engine-downloads-sw.js
// intercepts /engines/* and answers from that same cache; without a download
// the plain /engines/<file> URLs keep loading from the network, so nothing
// here is required for the engines to work - downloads only make them
// instant and offline-capable.

import {
    ENGINE_DOWNLOADS,
    getEngineDownloadInfo,
    getEngineDownloadSize
} from "shared/constants/EngineDownloads";
import EngineVersion from "shared/constants/EngineVersion";

const CACHE_NAME = "wintrchess-engines-v1";

// served from the site root (client/public), so its default scope covers
// every /engines/ request
const SERVICE_WORKER_URL = "/engine-downloads-sw.js";

// synthetic cache entries holding the download metadata per engine; they
// live outside /engines/ so no fetch ever hits them (only the cache API)
const META_URL_PREFIX = "/engine-downloads-meta/";

export interface DownloadedEngine {
    version: EngineVersion;
    downloadedAt: number;
    sizeBytes: number;
}

const toAbsoluteUrl = (path: string) => new URL(path, location.origin).href;
const getMetaUrl = (version: EngineVersion) => toAbsoluteUrl(META_URL_PREFIX + version);

// registers the cache-serving service worker once per page load. false
// means the browser cannot serve downloads from cache (no service worker
// support or a non-secure context), which callers surface as an error
// rather than silently downloading files that would never be used
let serviceWorkerPromise: Promise<boolean> | null = null;

export function ensureEngineDownloadServiceWorker(): Promise<boolean> {
    if (serviceWorkerPromise) return serviceWorkerPromise;

    serviceWorkerPromise = (async () => {
        if (!("serviceWorker" in navigator) || !("caches" in window)) {
            return false;
        }

        try {
            await navigator.serviceWorker.register(SERVICE_WORKER_URL, { scope: "/" });
            // resolves once the worker is active; it claims open pages, so
            // this session's engine fetches are intercepted as well
            await navigator.serviceWorker.ready;
            return true;
        } catch {
            return false;
        }
    })();

    return serviceWorkerPromise;
}

// drains a response body so callers get incremental byte counts; browsers
// without a readable body fall back to one arrayBuffer() read (no
// incremental progress, but the download still completes)
async function drainWithProgress(
    response: Response,
    onChunk: (bytes: number) => void
): Promise<void> {
    const reader = response.body?.getReader();

    if (!reader) {
        onChunk((await response.arrayBuffer()).byteLength);
        return;
    }

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        onChunk(value.length);
    }
}

// downloads every payload of one engine into the cache, reporting progress
// 0-100 across the whole set by bytes. entries keep their original content
// type because WebAssembly.instantiateStreaming rejects anything else, and
// are keyed by plain URL so the service worker can match the engine's
// ordinary /engines/ requests against them
export async function downloadEngine(
    version: EngineVersion,
    onProgress?: (progress: number) => void
): Promise<void> {
    const info = getEngineDownloadInfo(version);
    if (!info) throw new Error(`Unknown engine version: ${version}`);

    if (!await ensureEngineDownloadServiceWorker()) {
        throw new Error("Engine downloads are not supported in this browser");
    }

    const cache = await caches.open(CACHE_NAME);
    const totalBytes = getEngineDownloadSize(info);

    let loadedBytes = 0;
    const reportProgress = (bytes: number) => {
        loadedBytes += bytes;
        // hold at 99 until the files are actually stored, then jump to 100
        onProgress?.(Math.min(99, Math.round((loadedBytes / totalBytes) * 100)));
    };

    const downloadFile = async (path: string) => {
        const response = await fetch(path);
        if (!response.ok) {
            throw new Error(`Failed to download ${path}: ${response.status} ${response.statusText}`);
        }

        // the cache keeps an untouched clone of the network response: a
        // response rebuilt via new Response(...) is rejected when the site
        // later loads it as a worker script, and the original headers
        // already carry the correct js/wasm content types. the original
        // body is drained in parallel so progress still ticks while the
        // clone is written to disk
        const forCache = response.clone();

        await Promise.all([
            drainWithProgress(response, reportProgress),
            cache.put(toAbsoluteUrl(path), forCache)
        ]);
    };

    try {
        await Promise.all(info.files.map(file => downloadFile(file.path)));
    } catch (error) {
        // drop a partial download: without this the half-cached files
        // would waste quota and could later be served to the engine
        await deleteEngine(version).catch(() => {});
        if (error instanceof DOMException && error.name == "QuotaExceededError") {
            throw new Error("Not enough storage space to download this engine");
        }
        throw error;
    }

    const meta: DownloadedEngine = {
        version,
        downloadedAt: Date.now(),
        sizeBytes: totalBytes
    };

    await cache.put(getMetaUrl(version), new Response(JSON.stringify(meta), {
        headers: { "Content-Type": "application/json" }
    }));

    onProgress?.(100);
}

// lists engines whose every payload plus meta entry is present. metadata
// only - the payload buffers are never read out here
export async function getDownloadedEngines(): Promise<DownloadedEngine[]> {
    if (!("caches" in window)) return [];

    try {
        const cache = await caches.open(CACHE_NAME);

        const results = await Promise.all(ENGINE_DOWNLOADS.map(async info => {
            const payloads = await Promise.all(info.files.map(
                file => cache.match(toAbsoluteUrl(file.path))
            ));
            if (payloads.some(payload => !payload)) return null;

            const meta = await cache.match(getMetaUrl(info.version));
            if (!meta) return null;

            return await meta.json() as DownloadedEngine;
        }));

        return results.filter((result): result is DownloadedEngine => result != null);
    } catch {
        return [];
    }
}

// removes one engine's payloads and metadata; safe to call when nothing
// was downloaded (also used to clean up after a failed download)
export async function deleteEngine(version: EngineVersion): Promise<void> {
    const info = getEngineDownloadInfo(version);
    if (!info || !("caches" in window)) return;

    const cache = await caches.open(CACHE_NAME);
    await Promise.all([
        ...info.files.map(file => cache.delete(toAbsoluteUrl(file.path))),
        cache.delete(getMetaUrl(version))
    ]);
}

// re-export the shared metadata so consumers import engine info from one place
export {
    ENGINE_DOWNLOADS,
    getEngineDownloadInfo,
    getEngineDownloadSize,
    formatEngineSize
} from "shared/constants/EngineDownloads";
