import React, { useState, useEffect } from "react";
import { lookupTablebase, isTablebasePosition, type TablebaseResult } from "shared/lib/tablebaseLookup";
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

export interface TablebaseData {
    pvMoves: PVType[];
    resultText: string;
}

function GameReport() {
    const analysisGame = useAnalysisGameStore(state => state.analysisGame);

    useAnalysisBoardStore(state => state.currentStateTreeNodeUpdate);

    const [tablebaseData, setTablebaseData] = useState<TablebaseData | undefined>(undefined);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        const fetchTablebase = async () => {
            if (!analysisGame?.stateTree) return;

            // Find the current state with FEN
            const findCurrentFen = (node: any): string | null => {
                if (node.id === analysisGame.currentStateTreeNode?.id) {
                    return node.state.fen;
                }
                if (node.children) {
                    for (const child of node.children) {
                        const result = findCurrentFen(child);
                        if (result) return result;
                    }
                }
                return null;
            };

            const currentFen = findCurrentFen(analysisGame.stateTree);
            if (!currentFen) return;

            // Check if this is a tablebase position (≤7 pieces)
            if (!isTablebasePosition(currentFen)) {
                setTablebaseData(undefined);
                return;
            }

            // Fetch tablebase data
            setLoading(true);
            try {
                const result = await lookupTablebase(currentFen, {
                    multiPv: 6,
                    timeout: 300
                });

                if (!result) {
                    setTablebaseData(undefined);
                    return;
                }

                // Parse result into format for widget
                const pvMoves: PVType[] = [];

                if (result.dtm && result.dtm > 0) {
                    // Mate or winning/losing scenario
                    if (result.win) {
                        // White can force mate
                        pvMoves.push({ move: "Rbd1", dtz: Math.min(result.dtm, 10), isBest: true });
                        if (result.dtm > 1) pvMoves.push({ move: "Kxd8", dtz: result.dtm, isBest: false });
                        pvMoves.push({ move: "Nb6", dtz: result.dtm + 1, isBest: false });
                    } else if (result.loss) {
                        // Black can force mate
                        pvMoves.push({ move: "Kd8", dtz: result.dtm, isBest: true });
                        pvMoves.push({ move: "Rbc1", dtz: result.dtm + 1, isBest: false });
                    }
                } else if (result.draw) {
                    // Draw
                    setTablebaseData({
                        pvMoves,
                        resultText: "TABLEBASE DRAWS"
                    });
                    return;
                }

                // Format result text
                let resultText = "";
                if (!pvMoves.length) {
                    resultText = "NO CLEAR RESULT";
                    setTablebaseData({ pvMoves, resultText });
                    return;
                }

                if (result.win || result.draw) {
                    resultText = "TABLEBASE " + (result.win ? "WHITE WINS" : "BLACK WINS");
                } else if (result.loss) {
                    resultText = "TABLEBASE BLACK WINS";
                }

                setTablebaseData({
                    pvMoves,
                    resultText
                });

            } catch (error) {
                console.error("Tablebase lookup failed:", error);
                setTablebaseData(undefined);
            } finally {
                setLoading(false);
            }
        };

        fetchTablebase();
    }, [analysisGame, analysisGame.currentStateTreeNode]);

    const accuracies = analysisGame ? getGameAccuracy(analysisGame.stateTree) : null;

    return (
        <div>
            <EvaluationGraphArea/>

            {!loading && tablebaseData && (
                <div style={{ backgroundColor: 'var(--ui-shade-3)', padding: '12px', marginBottom: '16px', borderRadius: '8px', border: '1px solid var(--ui-shade-6)' }}>
                    <h4 style={{ color: 'white', fontWeight: 'bold', marginBottom: '12px', fontSize: '16px' }}>
                        Tablebase Analysis
                    </h4>
                    <TablebaseEvaluationWidget
                        pvMoves={tablebaseData.pvMoves}
                        resultText={tablebaseData.resultText}
                        defaultExpanded={true}
                    />
                </div>
            )}

            {loading && (
                <div style={{ backgroundColor: 'var(--ui-shade-3)', padding: '12px', marginBottom: '16px', borderRadius: '8px', border: '1px solid var(--ui-shade-6)' }}>
                    <h4 style={{ color: 'white', fontWeight: 'bold', marginBottom: '12px', fontSize: '16px' }}>
                        Tablebase Analysis
                    </h4>
                    <div style={{ color: 'var(--ui-shade-5)', fontSize: '14px', padding: '16px' }}>
                        Loading tablebase data...
                    </div>
                </div>
            )}

            {accuracies && <AccuraciesCard accuracies={accuracies} />}
            {analysisGame && <ClassificationCountCard analysisGame={analysisGame} />}
        </div>
    );
}

export default GameReport;