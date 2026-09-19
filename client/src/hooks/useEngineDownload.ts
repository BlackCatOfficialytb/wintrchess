import { useState, useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import EngineVersion from "shared/constants/EngineVersion";
import {
    downloadEngine,
    getDownloadedEngines,
    deleteEngine,
    getEngineDownloadInfo,
    ENGINE_DOWNLOADS
} from "@/lib/engineDownloader";
import { toast } from "react-toastify";

export function useEngineDownload() {
    const { t } = useTranslation("analysis");
    const [downloading, setDownloading] = useState<EngineVersion | null>(null);
    const [progress, setProgress] = useState(0);
    const [downloadedEngines, setDownloadedEngines] = useState<
        Array<{ version: EngineVersion; downloadedAt: number; size: number }>
    >([]);

    const refreshDownloaded = useCallback(async () => {
        const engines = await getDownloadedEngines();
        setDownloadedEngines(engines);
    }, []);

    useEffect(() => {
        refreshDownloaded();
    }, [refreshDownloaded]);

    const handleDownload = useCallback(async (version: EngineVersion) => {
        if (downloading) return;

        setDownloading(version);
        setProgress(0);

        try {
            await downloadEngine(version, setProgress);
            toast.success(t("settings.engine.downloadSuccess", { engine: getEngineDownloadInfo(version)?.label || version }));
            await refreshDownloaded();
        } catch (error) {
            toast.error(t("settings.engine.downloadError", { error: String(error) }));
        } finally {
            setDownloading(null);
            setProgress(0);
        }
    }, [downloading, t, refreshDownloaded]);

    const handleDelete = useCallback(async (version: EngineVersion) => {
        await deleteEngine(version);
        toast.success(t("settings.engine.deleted", { engine: getEngineDownloadInfo(version)?.label || version }));
        await refreshDownloaded();
    }, [t, refreshDownloaded]);

    const isDownloaded = useCallback((version: EngineVersion) => {
        return downloadedEngines.some(e => e.version === version);
    }, [downloadedEngines]);

    const getDownloadInfo = useCallback((version: EngineVersion) => {
        return getEngineDownloadInfo(version);
    }, []);

    const getAllDownloads = useCallback(() => {
        return ENGINE_DOWNLOADS;
    }, []);

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