import React, { useState } from "react";
import { useTranslation } from "react-i18next";

import ButtonColour from "@/components/common/Button/Colour";
import Dialog from "@/components/common/Dialog";
import Button from "@/components/common/Button";
import { useEngineDownload } from "@/hooks/useEngineDownload";

import * as styles from "./EngineDownloadsDialog.module.css";

function EngineDownloadsDialog({ onClose }: { onClose: () => void }) {
    const { t } = useTranslation("analysis");
    const {
        downloading,
        progress,
        downloadedEngines,
        refreshDownloaded,
        handleDownload,
        handleDelete,
        isDownloaded,
        getDownloadInfo,
        getAllDownloads
    } = useEngineDownload();

    const [showAll, setShowAll] = useState(false);

    const downloads = getAllDownloads();
    const visibleDownloads = showAll ? downloads : downloads.slice(0, 3);

    return <Dialog className={styles.dialog} onClose={onClose}>
        <div className={styles.header}>
            {t("settings.engine.downloads.title")}
        </div>

        <div className={styles.content}>
            {downloadedEngines.length > 0 && (
                <div className={styles.downloadedList}>
                    <span className={styles.downloadedHeader}>
                        {t("settings.engine.downloads.downloaded")}
                    </span>
                    {downloadedEngines.map(engine => {
                        const info = getDownloadInfo(engine.version);
                        return (
                            <div key={engine.version} className={styles.downloadedItem}>
                                <span className={styles.downloadedLabel}>
                                    {info?.label || engine.version}
                                </span>
                                <span className={styles.downloadedSize}>
                                    {(engine.size / 1024 / 1024).toFixed(1)} MB
                                </span>
                                <Button
                                    className={styles.smallButton}
                                    style={{ backgroundColor: ButtonColour.GREY }}
                                    onClick={() => handleDelete(engine.version)}
                                >
                                    {t("settings.engine.downloads.remove")}
                                </Button>
                            </div>
                        );
                    })}
                </div>
            )}

            <div className={styles.availableList}>
                <span className={styles.availableHeader}>
                    {t("settings.engine.downloads.available")}
                </span>
                {visibleDownloads.map(info => {
                    const downloaded = isDownloaded(info.version);
                    const isDownloading = downloading === info.version;

                    return (
                        <div key={info.version} className={styles.availableItem}>
                            <div className={styles.availableInfo}>
                                <span className={styles.availableLabel}>
                                    {info.label}
                                </span>
                                <span className={styles.availableDescription}>
                                    {info.description} ({info.size})
                                </span>
                            </div>
                            <div className={styles.availableActions}>
                                {isDownloading && (
                                    <div className={styles.downloadProgress}>
                                        <div
                                            className={styles.progressBar}
                                            style={{ width: `${progress}%` }}
                                        />
                                        <span className={styles.progressText}>
                                            {progress}%
                                        </span>
                                    </div>
                                )}
                                {!downloaded && !isDownloading && (
                                    <Button
                                        className={styles.smallButton}
                                        style={{ backgroundColor: ButtonColour.BLUE }}
                                        onClick={() => handleDownload(info.version)}
                                    >
                                        {t("settings.engine.downloads.download")}
                                    </Button>
                                )}
                                {downloaded && !isDownloading && (
                                    <Button
                                        className={styles.smallButton}
                                        style={{ backgroundColor: ButtonColour.GREY }}
                                        onClick={() => handleDelete(info.version)}
                                    >
                                        {t("settings.engine.downloads.remove")}
                                    </Button>
                                )}
                            </div>
                        </div>
                    );
                })}
                {downloads.length > 3 && (
                    <Button
                        className={styles.showMoreButton}
                        style={{ backgroundColor: ButtonColour.TRANSPARENT }}
                        onClick={() => setShowAll(!showAll)}
                    >
                        {showAll
                            ? t("settings.engine.downloads.showLess")
                            : t("settings.engine.downloads.showMore")}
                    </Button>
                )}
            </div>
        </div>
    </Dialog>;
}

export default EngineDownloadsDialog;