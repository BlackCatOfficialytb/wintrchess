import { ENGINE_DOWNLOADS, getEngineDownloadInfo } from "shared/constants/EngineDownloads";
import EngineVersion from "shared/constants/EngineVersion";

const ENGINE_CACHE_PREFIX = "wintrchess_engine_";
const ENGINE_META_KEY = "wintrchess_engine_meta";

interface EngineMeta {
    version: EngineVersion;
    downloadedAt: number;
    size: number;
    jsBlob: Blob;
    wasmBlob?: Blob;
}

async function getCachedEngine(version: EngineVersion): Promise<EngineMeta | null> {
    try {
        const metaStr = localStorage.getItem(`${ENGINE_CACHE_PREFIX}${version}`);
        if (!metaStr) return null;

        const meta = JSON.parse(metaStr) as Omit<EngineMeta, "jsBlob" | "wasmBlob"> & {
            jsBlob: string;
            wasmBlob?: string;
        };

        const jsBlob = await (async () => {
            const response = await fetch(meta.jsBlob);
            return response.blob();
        })();

        let wasmBlob: Blob | undefined;
        if (meta.wasmBlob) {
            const response = await fetch(meta.wasmBlob);
            wasmBlob = await response.blob();
        }

        return { ...meta, jsBlob, wasmBlob };
    } catch {
        return null;
    }
}

async function cacheEngine(meta: EngineMeta): Promise<void> {
    const jsObjectUrl = URL.createObjectURL(meta.jsBlob);
    let wasmObjectUrl: string | undefined;
    if (meta.wasmBlob) {
        wasmObjectUrl = URL.createObjectURL(meta.wasmBlob);
    }

    const toStore = {
        version: meta.version,
        downloadedAt: meta.downloadedAt,
        size: meta.size,
        jsBlob: jsObjectUrl,
        wasmBlob: wasmObjectUrl
    };

    localStorage.setItem(`${ENGINE_CACHE_PREFIX}${meta.version}`, JSON.stringify(toStore));

    const allMetaStr = localStorage.getItem(ENGINE_META_KEY);
    const allMeta: Record<string, { version: EngineVersion; downloadedAt: number; size: number }> = allMetaStr ? JSON.parse(allMetaStr) : {};
    allMeta[meta.version] = { version: meta.version, downloadedAt: meta.downloadedAt, size: meta.size };
    localStorage.setItem(ENGINE_META_KEY, JSON.stringify(allMeta));
}

export async function downloadEngine(
    version: EngineVersion,
    onProgress?: (progress: number) => void
): Promise<{ jsBlob: Blob; wasmBlob?: Blob }> {
    const info = getEngineDownloadInfo(version);
    if (!info) throw new Error(`Unknown engine version: ${version}`);

    const downloadJs = async (): Promise<Blob> => {
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
            const blob = await response.blob();
            return blob;
        }

        return new Blob(chunks);
    };

    const downloadWasm = async (): Promise<Blob | undefined> => {
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
            const blob = await response.blob();
            return blob;
        }

        return new Blob(chunks);
    };

    const [jsBlob, wasmBlob] = await Promise.all([downloadJs(), downloadWasm()]);

    const meta: EngineMeta = {
        version,
        downloadedAt: Date.now(),
        size: jsBlob.size + (wasmBlob?.size || 0),
        jsBlob,
        wasmBlob
    };

    await cacheEngine(meta);

    return { jsBlob, wasmBlob };
}

export async function getEngineBlob(version: EngineVersion): Promise<{ jsBlob: Blob; wasmBlob?: Blob } | null> {
    const cached = await getCachedEngine(version);
    if (cached) {
        return { jsBlob: cached.jsBlob, wasmBlob: cached.wasmBlob };
    }
    return null;
}

export function isEngineDownloaded(version: EngineVersion): boolean {
    return localStorage.getItem(`${ENGINE_CACHE_PREFIX}${version}`) !== null;
}

export function getDownloadedEngines(): Array<{ version: EngineVersion; downloadedAt: number; size: number }> {
    const metaStr = localStorage.getItem(ENGINE_META_KEY);
    if (!metaStr) return [];
    return Object.values(JSON.parse(metaStr));
}

export function deleteEngine(version: EngineVersion): void {
    localStorage.removeItem(`${ENGINE_CACHE_PREFIX}${version}`);

    const metaStr = localStorage.getItem(ENGINE_META_KEY);
    if (metaStr) {
        const meta = JSON.parse(metaStr);
        delete meta[version];
        localStorage.setItem(ENGINE_META_KEY, JSON.stringify(meta));
    }
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

// Re-export from shared package
export { ENGINE_DOWNLOADS, getEngineDownloadInfo } from "shared/constants/EngineDownloads";