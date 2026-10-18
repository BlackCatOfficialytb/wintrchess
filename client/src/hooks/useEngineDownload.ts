import { useState, useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import EngineVersion from "shared/constants/EngineVersion";
import {
    downloadEngine,
    getDownloadedEngines,
    deleteEngine,
    getEngineDownloadInfo,
    ensureEngineDownloadServiceWorker,
    ENGINE_DOWNLOADS,
    DownloadedEngine
} from "@/lib/engineDownloader";
import { toast } from "react-toastify";

export function useEngineDownload() {
    const { t } = useTranslation("analysis");
    const [downloading, setDownloading] = useState<EngineVersion | null>(null);
    const [progress, setProgress] = useState(0);
    const [downloadedEngines, setDownloadedEngines] = useState<DownloadedEngine[]>([]);

    const refreshDownloaded = useCallback(async () => {
        setDownloadedEngines(await getDownloadedEngines());
    }, []);

    // the cache-serving service worker is registered up front; everything
    // downloaded in previous visits is already served from cache before
    // this dialog is even opened
    useEffect(() => {
        refreshDownloaded();
        ensureEngineDownloadServiceWorker();
    }, [refreshDownloaded]);

    const handleDownload = useCallback(async (version: EngineVersion) => {
        if (downloading) return;

        setDownloading(version);
        setProgress(0);

        try {
            await downloadEngine(version, setProgress);
            toast.success(t("settings.engine.downloads.downloadSuccess", {
                engine: getEngineDownloadInfo(version)?.label || version
            }));
            await refreshDownloaded();
        } catch (error) {
            toast.error(t("settings.engine.downloads.downloadError", {
                error: error instanceof Error ? error.message : String(error)
            }));
        } finally {
            setDownloading(null);
            setProgress(0);
        }
    }, [downloading, t, refreshDownloaded]);

    const handleDelete = useCallback(async (version: EngineVersion) => {
        await deleteEngine(version);
        toast.success(t("settings.engine.downloads.deleted", {
            engine: getEngineDownloadInfo(version)?.label || version
        }));
        await refreshDownloaded();
    }, [t, refreshDownloaded]);

    const isDownloaded = useCallback((version: EngineVersion) => {
        return downloadedEngines.some(engine => engine.version == version);
    }, [downloadedEngines]);

    const getDownloadInfo = useCallback((version: EngineVersion) => {
        return getEngineDownloadInfo(version);
    }, []);

    const getAllDownloads = useCallback(() => ENGINE_DOWNLOADS, []);

    return {
        downloading,
        progress,
        downloadedEngines,
        refreshDownloaded,
        handleDownload,
        handleDelete,
        isDownloaded,
        getDownloadInfo,
        getAllDownloads
    };
}
