// local engine cache: downloads the stockfish js/wasm payloads listed in
// shared EngineDownloads, stores them in IndexedDB so repeat visits run
// fully offline, and hands out Blobs for the engine worker to consume.
// metadata (version/size/date) is kept alongside the payloads so the
// settings UI can list what is downloaded without reading the buffers.

import { ENGINE_DOWNLOADS, getEngineDownloadInfo } from "shared/constants/EngineDownloads";
import EngineVersion from "shared/constants/EngineVersion";

// one IndexedDB database for all engine versions; object store keyed by
// EngineVersion so each engine has exactly one cached copy
const DB_NAME = "wintrchess_engines";
const STORE_NAME = "engines";
const DB_VERSION = 1;

interface EngineMeta {
    version: EngineVersion;
    downloadedAt: number;
    size: number;
    jsArrayBuffer: ArrayBuffer;
    wasmArrayBuffer?: ArrayBuffer;
}

// opens (and on first use creates) the cache database; every public helper
// calls this itself so there is no shared connection to keep alive/close
function openDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
        request.onupgradeneeded = (event) => {
            const db = (event.target as IDBOpenDBRequest).result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: "version" });
            }
        };
    });
}

// reads one engine's cached entry; any error (indexedDB unavailable in
// private browsing, blocked storage, upgrade race) degrades to "not cached"
async function getCachedEngine(version: EngineVersion): Promise<EngineMeta | null> {
    try {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(STORE_NAME, "readonly");
            const store = transaction.objectStore(STORE_NAME);
            const request = store.get(version);
            request.onsuccess = () => {
                const result = request.result as EngineMeta | undefined;
                if (result) {
                    resolve(result);
                } else {
                    resolve(null);
                }
            };
            request.onerror = () => reject(request.error);
        });
    } catch {
        return null;
    }
}

// stores the freshly downloaded buffers; put() overwrites an existing entry
// for the same version, so a re-download just replaces the old copy
async function cacheEngine(meta: EngineMeta): Promise<void> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, "readwrite");
        const store = transaction.objectStore(STORE_NAME);
        const request = store.put(meta);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

// downloads js + wasm in parallel, caches both in IndexedDB, and returns
// them as Blobs. progress spans 0-50 while the js payload streams and
// 50-100 for wasm (or the whole range on js alone when the engine has no
// wasm), so callers see one continuous bar across the two fetches
export async function downloadEngine(
    version: EngineVersion,
    onProgress?: (progress: number) => void
): Promise<{ jsBlob: Blob; wasmBlob?: Blob }> {
    const info = getEngineDownloadInfo(version);
    if (!info) throw new Error(`Unknown engine version: ${version}`);

    // streams the js entry point chunk by chunk (response.body reader)
    // so partial progress is reportable; falls back to arrayBuffer() for
    // environments without streaming, which means no progress updates
    const downloadJs = async (): Promise<ArrayBuffer> => {
        const response = await fetch(info.jsUrl);
        if (!response.ok) throw new Error(`Failed to download JS: ${response.statusText}`);

        const contentLength = response.headers.get("content-length");
        const total = contentLength ? parseInt(contentLength, 10) : 0;
        let loaded = 0;

        const reader = response.body?.getReader();
        const chunks: Uint8Array[] = [];

        if (reader) {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                chunks.push(value);
                loaded += value.length;
                if (total > 0 && onProgress) {
                    onProgress(Math.round((loaded / total) * 50));
                }
            }
        } else {
            return response.arrayBuffer();
        }

        const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
        const result = new Uint8Array(totalLength);
        let offset = 0;
        for (const chunk of chunks) {
            result.set(chunk, offset);
            offset += chunk.length;
        }
        return result.buffer;
    };

    // wasm is optional (pure-JS builds); same streaming approach as the js
    // payload, reporting the 50-100 half of the total progress range
    const downloadWasm = async (): Promise<ArrayBuffer | undefined> => {
        if (!info.wasmUrl) return undefined;

        let response = await fetch(info.wasmUrl);
        if (!response.ok) {
            // client-side fallback: the local payload wasm is missing, so
            // retry the release-asset name derived from the engine entry
            // (the "sf wasm link.txt" convention <entry>.wasm). GitHub
            // release assets send no CORS headers - a direct fetch throws
            // "Failed to fetch" - so the retry stays same-origin and the
            // server mirrors the txt links under /engines/.
            const releaseWasm = info.jsUrl.replace(/\.js$/, ".wasm");
            if (releaseWasm != info.wasmUrl) response = await fetch(releaseWasm);
        }
        if (!response.ok) throw new Error(`Failed to download WASM: ${response.statusText}`);

        const contentLength = response.headers.get("content-length");
        const total = contentLength ? parseInt(contentLength, 10) : 0;
        let loaded = 0;

        const reader = response.body?.getReader();
        const chunks: Uint8Array[] = [];

        if (reader) {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                chunks.push(value);
                loaded += value.length;
                if (total > 0 && onProgress) {
                    onProgress(50 + Math.round((loaded / total) * 50));
                }
            }
        } else {
            return response.arrayBuffer();
        }

        const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
        const result = new Uint8Array(totalLength);
        let offset = 0;
        for (const chunk of chunks) {
            result.set(chunk, offset);
            offset += chunk.length;
        }
        return result.buffer;
    };

    const [jsArrayBuffer, wasmArrayBuffer] = await Promise.all([downloadJs(), downloadWasm()]);

    const meta: EngineMeta = {
        version,
        downloadedAt: Date.now(),
        size: jsArrayBuffer.byteLength + (wasmArrayBuffer?.byteLength || 0),
        jsArrayBuffer,
        wasmArrayBuffer
    };

    await cacheEngine(meta);

    return {
        jsBlob: new Blob([jsArrayBuffer]),
        wasmBlob: wasmArrayBuffer ? new Blob([wasmArrayBuffer]) : undefined
    };
}

// returns the js/wasm as Blobs, cache-first; null means "never downloaded
// or cache unreadable", which callers treat as "must download first"
export async function getEngineBlob(version: EngineVersion): Promise<{ jsBlob: Blob; wasmBlob?: Blob } | null> {
    const cached = await getCachedEngine(version);
    if (cached) {
        return {
            jsBlob: new Blob([cached.jsArrayBuffer]),
            wasmBlob: cached.wasmArrayBuffer ? new Blob([cached.wasmArrayBuffer]) : undefined
        };
    }
    return null;
}

// synchronous stub kept for API compatibility: IndexedDB reads are async,
// so a truthful check needs getDownloadedEngines()/getEngineBlob() instead.
// callers (useEngineDownload) already derive the flag from their own state
export function isEngineDownloaded(version: EngineVersion): boolean {
    return false;
}

// lists cached engines as metadata only (buffers stripped) - used by the
// settings UI to render download sizes/dates without loading payloads
export async function getDownloadedEngines(): Promise<Array<{ version: EngineVersion; downloadedAt: number; size: number }>> {
    try {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(STORE_NAME, "readonly");
            const store = transaction.objectStore(STORE_NAME);
            const request = store.getAll();
            request.onsuccess = () => {
                const results = request.result as EngineMeta[];
                resolve(results.map(r => ({ version: r.version, downloadedAt: r.downloadedAt, size: r.size })));
            };
            request.onerror = () => reject(request.error);
        });
    } catch {
        return [];
    }
}

// removes one engine's cache entry (settings UI "delete"); no-op if absent
export async function deleteEngine(version: EngineVersion): Promise<void> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, "readwrite");
        const store = transaction.objectStore(STORE_NAME);
        const request = store.delete(version);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

// path to the same-origin /engines/ mirror (the server serves these files;
// going through it avoids the CORS-less GitHub release assets, see the
// wasm fallback comment in downloadEngine)
export function getEngineUrl(version: EngineVersion): string {
    return `/engines/${version}`;
}

// object-URL helpers: engine workers get a blob: URL rather than the Blob
// itself; every createEngineObjectUrl must eventually be paired with
// revokeEngineObjectUrl so the blob memory is released
export function createEngineObjectUrl(blob: Blob): string {
    return URL.createObjectURL(blob);
}

export function revokeEngineObjectUrl(url: string): void {
    URL.revokeObjectURL(url);
}

// re-export shared constants so consumers import engine metadata from one place
export { ENGINE_DOWNLOADS, getEngineDownloadInfo } from "shared/constants/EngineDownloads";