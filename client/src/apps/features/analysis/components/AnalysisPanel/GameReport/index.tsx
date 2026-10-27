import React, { useState, useEffect } from "react";
import {
    lookupTablebase,
    isTablebasePosition,
    formatTablebaseResult,
    type TablebaseResult
} from "shared/lib/tablebaseLookup";
import { getGameAccuracy } from "shared/lib/reporter/accuracy";
import useAnalysisGameStore from "@analysis/stores/AnalysisGameStore";
import useAnalysisBoardStore from "@analysis/stores/AnalysisBoardStore";
import AccuraciesCard from "@analysis/components/report/AccuraciesCard";
import ClassificationCountCard from "@analysis/components/report/ClassificationCountCard";
import TablebaseEvaluationWidget from "@analysis/components/report/TablebaseEvaluationWidget";

import EvaluationGraphArea from "./EvaluationGraphArea";

interface PVType {
    move: string;
    dtz: number;
    isBest: boolean;
}

interface TablebaseDisplayData {
    pvMoves: PVType[];
    resultText: string;
}

/** Legal move variations shown in the widget */
const VARIATION_COUNT = 6;

function getTablebaseDisplayData(
    result: TablebaseResult,
    fen: string
): TablebaseDisplayData {
    const pvMoves: PVType[] = result.moves
        .slice(0, VARIATION_COUNT)
        .map((rate, index) => ({
            move: rate.san,
            // Signed dtz values are negative for losing variations
            dtz: Math.abs(rate.dtz ?? rate.dtm ?? 0),
            isBest: index == 0
        }));

    return {
        pvMoves,
        resultText: formatTablebaseResult(result, fen)
    };
}

function GameReport() {
    const analysisGame = useAnalysisGameStore(state => state.analysisGame);

    const currentStateTreeNode = useAnalysisBoardStore(
        state => state.currentStateTreeNode
    );

    const [tablebaseData, setTablebaseData] = useState<TablebaseDisplayData | undefined>(undefined);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        let cancelled = false;

        const fen = currentStateTreeNode?.state?.fen;

        if (!fen || !isTablebasePosition(fen)) {
            setTablebaseData(undefined);
            setLoading(false);
            return;
        }

        setLoading(true);

        lookupTablebase(fen).then(result => {
            if (cancelled) return;

            setTablebaseData(
                result
                    ? getTablebaseDisplayData(result, fen)
                    : undefined
            );
        }).finally(() => {
            if (!cancelled) setLoading(false);
        });

        return () => {
            cancelled = true;
        };
    }, [currentStateTreeNode?.id]);

    const accuracies = analysisGame
        ? getGameAccuracy(analysisGame.stateTree)
        : null;

    return (
        <div>
            <EvaluationGraphArea/>

            {(loading || tablebaseData) && (
                <div style={{ backgroundColor: 'var(--ui-shade-3)', padding: '12px', marginBottom: '16px', borderRadius: '8px', border: '1px solid var(--ui-shade-6)' }}>
                    <h4 style={{ color: 'white', fontWeight: 'bold', marginBottom: '12px', fontSize: '16px' }}>
                        Tablebase Analysis
                    </h4>
                    {loading ? (
                        <div style={{ color: 'var(--ui-shade-5)', fontSize: '14px', padding: '16px' }}>
                            Loading tablebase data...
                        </div>
                    ) : tablebaseData && (
                        <TablebaseEvaluationWidget
                            pvMoves={tablebaseData.pvMoves}
                            resultText={tablebaseData.resultText}
                            defaultExpanded={true}
                        />
                    )}
                </div>
            )}

            {accuracies && <AccuraciesCard accuracies={accuracies} />}
            {analysisGame && <ClassificationCountCard analysisGame={analysisGame} />}
        </div>
    );
}

export default GameReport;
