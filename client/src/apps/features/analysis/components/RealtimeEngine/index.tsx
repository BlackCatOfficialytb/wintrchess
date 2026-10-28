import React, { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Tooltip } from "react-tooltip";
import { Chess } from "chess.js";
import { range } from "lodash-es";

import EngineVersion from "shared/constants/EngineVersion";
import { EngineLine } from "shared/types/game/position/EngineLine";
import { pickEngineLines } from "shared/types/game/position/EngineLine";
import LogMessage from "@/components/common/LogMessage";
import Engine from "@analysis/lib/engine";
import { getDynamicDepthCap } from "@analysis/lib/dynamicDepth";

import EngineLineInfo from "./EngineLine";
import SkeletonLine from "./SkeletonLine";
import RealtimeEngineProps from "./RealtimeEngineProps";
import * as styles from "./RealtimeEngine.module.css";

type Timeout = ReturnType<typeof setTimeout>;

function RealtimeEngine({
    className,
    style,
    initialPosition,
    playedUciMoves,
    config,
    cachedEngineLines,
    onEngineLines,
    onEvaluationStart,
    onEvaluationComplete
}: RealtimeEngineProps) {
    const hydratedConfig = { ...config, lines: config.lines || 1 };

    const { t } = useTranslation("analysis");

    const [ engine, setEngine ] = useState<Engine>();

    const [
        realtimeEngineLines,
        setRealtimeEngineLines
    ] = useState<EngineLine[]>([]);

    const [ evaluationError, setEvaluationError ] = useState<string>();

    // "Go Deeper" removes the active depth cap (up to max depth 99)
    const [ depthOverride, setDepthOverride ] = useState<number>();
    const [ overrideRequested, setOverrideRequested ] = useState(false);

    const evaluationDelayRef = useRef<Timeout>();

    const position = useMemo(() => {
        const board = new Chess(initialPosition);
        if (!playedUciMoves) return initialPosition;

        for (const uciMove of playedUciMoves) {
            try {
                board.move(uciMove);
            } catch {
                return initialPosition;
            }
        }

        return board.fen();
    }, [initialPosition, playedUciMoves]);

    // Instantiate new engine when version changes
    useEffect(() => {
        engine?.terminate();

        let mounted = true;

        let newEngine: Engine;
        try {
            newEngine = new Engine(hydratedConfig.version, hydratedConfig.multiThreaded);
        } catch (err) {
            if (mounted) {
                setEvaluationError(
                    t("realtimeEngine.error") + ": " + String(err)
                );
            }

            return;
        }

        if (mounted) {
            setEngine(newEngine);
        } else {
            newEngine.terminate();
        }

        return () => {
            mounted = false;
            engine?.terminate();
        };
    }, [hydratedConfig.version, hydratedConfig.multiThreaded]);

    // Get number of lines expected to appear
    const expectedLineCount = useMemo(() => Math.min(
        new Chess(position).moves().length,
        hydratedConfig.lines
    ), [position, hydratedConfig.lines]);

    // Calculate which lines should be displayed
    const displayedCacheLines = useMemo(() => pickEngineLines(
        position,
        cachedEngineLines || [],
        {
            count: hydratedConfig.lines,
            depth: hydratedConfig.depth,
            source: hydratedConfig.version
        }
    ), [
        position,
        cachedEngineLines,
        hydratedConfig.lines,
        hydratedConfig.depth,
        hydratedConfig.version
    ]);

    const displayedLocalLines = useMemo(() => pickEngineLines(
        position,
        realtimeEngineLines,
        {
            count: hydratedConfig.lines,
            source: hydratedConfig.version
        }
    ) || [], [realtimeEngineLines]);

    const displayedLines = displayedCacheLines || displayedLocalLines;

    // Cloud/tablebase analyses have pre-computed depths — no dynamic cap or override
    const isExternalEval = displayedLines.at(0)?.source == EngineVersion.LICHESS_CLOUD
        || displayedLines.at(0)?.source == EngineVersion.EGTB_SYZYGY;

    // Effective depth cap: dynamic (hardware-based) or the user's setting;
    // lifted entirely once "Go Deeper" is pressed for this position.
    const targetDepth = isExternalEval
        ? undefined
        : (overrideRequested
            ? 99
            : (hydratedConfig.dynamicDepth
                ? getDynamicDepthCap(hydratedConfig.multiThreaded)
                : hydratedConfig.depth));

    const evaluatedDepth = displayedLocalLines.at(0)?.depth || 0;

    const depthCapReached = !isExternalEval
        && !displayedCacheLines
        && !overrideRequested
        && evaluatedDepth > 0
        && evaluatedDepth >= (targetDepth ?? 0);

    // Reset the override when the position changes
    useEffect(() => {
        setOverrideRequested(false);
        setDepthOverride(undefined);
    }, [position]);

    // Re-run evaluation when "Go Deeper" is pressed
    useEffect(() => {
        if (depthOverride === undefined) return;

        async function resumeEvaluation() {
            await engine?.stopEvaluation();

            setRealtimeEngineLines([]);

            evaluatePosition();
        }

        resumeEvaluation();
    }, [depthOverride]);

    // Cloud-evaluated games get a "CLOUD" suffix on the depth indicator
    const cloudAnalysed = displayedLines.at(0)?.source == EngineVersion.LICHESS_CLOUD;
    const tablebaseAnalysed = displayedLines.at(0)?.source == EngineVersion.EGTB_SYZYGY;

    useEffect(() => (
        onEngineLines?.(displayedLines)
    ), [displayedLines]);

    async function evaluatePosition() {
        if (!engine) return;

        engine.setPosition(initialPosition, playedUciMoves);
        engine.setLineCount(hydratedConfig.lines);

        try {
            setEvaluationError(undefined);
            onEvaluationStart?.();

            const lines = await engine.evaluate({
                depth: targetDepth,
                timeLimit: (
                    hydratedConfig.timeLimit
                    && (hydratedConfig.timeLimit * 1000)
                ),
                onEngineLine: line => {
                    setRealtimeEngineLines(prev => [ ...prev, line ]);
                }
            });

            onEvaluationComplete?.(lines);
        } catch {
            setEvaluationError(
                t("realtimeEngine.error")
            );
        }
    }

    // Evaluate position when settings or position change
    useEffect(() => {
        if (displayedCacheLines) return;

        async function queueEvaluation() {
            await engine?.stopEvaluation();

            if (evaluationDelayRef.current) {
                clearTimeout(evaluationDelayRef.current);
            }

            setRealtimeEngineLines([]);

            evaluationDelayRef.current = setTimeout(evaluatePosition, 400);
        }

        queueEvaluation();
    }, [
        position,
        engine,
        hydratedConfig.depth,
        hydratedConfig.dynamicDepth,
        hydratedConfig.multiThreaded,
        hydratedConfig.lines
    ]);

    return <div
        className={`${styles.wrapper} ${className}`}
        style={style}
    >
        <span className={styles.depth}>
            <span>
                {t("realtimeEngine.depth")}
            </span>

            <span>
                {displayedLines.at(0)?.depth || 0}
                {!isExternalEval && !overrideRequested && hydratedConfig.dynamicDepth && targetDepth && ` / ${targetDepth}`}
            </span>

            {cloudAnalysed && (
                <span
                    className={styles.cloudBadge}
                    data-tooltip-id="realtime-engine-depth"
                >
                    CLOUD
                </span>
            )}

            {tablebaseAnalysed && (
                <span
                    className={styles.tablebaseBadge}
                    data-tooltip-id="realtime-engine-tablebase"
                >
                    TABLEBASE
                </span>
            )}
        </span>

        {cloudAnalysed && (
            <Tooltip
                id="realtime-engine-depth"
                content={t("realtimeEngine.analysedByCloudEval")}
                delayShow={400}
            />
        )}

        {tablebaseAnalysed && (
            <Tooltip
                id="realtime-engine-tablebase"
                content={t("realtimeEngine.analysedByTablebase")}
                delayShow={400}
            />
        )}

        {displayedLines.map((line, index) => <>
            <EngineLineInfo line={line} key={line.index} />

            {index != (displayedLines.length - 1)
                && <hr className={styles.engineLineSeparator} />
            }
        </>)}

        {depthCapReached && (
            <button
                className={styles.goDeeperButton}
                onClick={() => {
                    setOverrideRequested(true);
                    setDepthOverride(99);
                }}
            >
                <span className={styles.goDeeperPlus}>+</span>
                {t("realtimeEngine.goDeeper")}
            </button>
        )}

        {displayedLines.at(0)?.depth != 0
            && range(
                Math.max(0, expectedLineCount - displayedLines.length)
            ).map(() => <>
                <hr className={styles.engineLineSeparator} />
                <SkeletonLine/>
            </>)
        }

        {evaluationError && <LogMessage>
            {evaluationError}
        </LogMessage>}
    </div>;
}

export default RealtimeEngine;