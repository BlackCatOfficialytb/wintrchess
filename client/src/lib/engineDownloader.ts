import { ENGINE_DOWNLOADS, getEngineDownloadInfo } from "shared/constants/EngineDownloads";
import EngineVersion from "shared/constants/EngineVersion";

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

export async function downloadEngine(
    version: EngineVersion,
    onProgress?: (progress: number) => void
): Promise<{ jsBlob: Blob; wasmBlob?: Blob }> {
    const info = getEngineDownloadInfo(version);
    if (!info) throw new Error(`Unknown engine version: ${version}`);

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

    const downloadWasm = async (): Promise<ArrayBuffer | undefined> => {
        if (!info.wasmUrl) return undefined;

        const response = await fetch(info.wasmUrl);
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

export function isEngineDownloaded(version: EngineVersion): boolean {
    return false;
}

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

export function getEngineUrl(version: EngineVersion): string {
    return `/engines/${version}`;
}

export function createEngineObjectUrl(blob: Blob): string {
    return URL.createObjectURL(blob);
}

export function revokeEngineObjectUrl(url: string): void {
    URL.revokeObjectURL(url);
}

export { ENGINE_DOWNLOADS, getEngineDownloadInfo } from "shared/constants/EngineDownloads";