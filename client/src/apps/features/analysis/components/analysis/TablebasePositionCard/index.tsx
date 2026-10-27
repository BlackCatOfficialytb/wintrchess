import React, { useEffect, useState } from "react";

import {
    lookupTablebase,
    isTablebasePosition,
    formatTablebaseResult,
    type TablebaseResult
} from "shared/lib/tablebaseLookup";
import useAnalysisBoardStore from "@analysis/stores/AnalysisBoardStore";
import TablebaseEvaluationWidget from "@analysis/components/report/TablebaseEvaluationWidget";

interface PVType {
    move: string;
    dtz: number;
    isBest: boolean;
}

interface TablebaseDisplayData {
    pvMoves: PVType[];
    resultText: string;
}

const VARIATION_COUNT = 6;

function getTablebaseDisplayData(
    result: TablebaseResult,
    fen: string
): TablebaseDisplayData {
    return {
        pvMoves: result.moves
            .slice(0, VARIATION_COUNT)
            .map((rate, index) => ({
                move: rate.san,
                // Signed dtz values are negative for losing variations
                dtz: Math.abs(rate.dtz ?? rate.dtm ?? 0),
                isBest: index == 0
            })),
        resultText: formatTablebaseResult(result, fen)
    };
}

/**
 * Tablebase lookup for the currently viewed position.
 *
 * Runs purely client-side and shows results while analysis is still
 * running: displayed whenever the current position has 7 pieces or
 * fewer, regardless of evaluation progress.
 */
function TablebasePositionCard() {
    const currentNode = useAnalysisBoardStore(
        state => state.currentStateTreeNode
    );

    const [tablebaseData, setTablebaseData] = useState<TablebaseDisplayData | undefined>(undefined);
    const [loading, setLoading] = useState(false);

    const fen = currentNode?.state?.fen;

    useEffect(() => {
        let cancelled = false;

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
    }, [fen]);

    if (!fen || !isTablebasePosition(fen)) {
        return null;
    }

    return (
        <div style={{ marginBottom: "10px" }}>
            {loading ? (
                <div
                    style={{
                        padding: "10px 12px",
                        borderRadius: "10px",
                        backgroundColor: "var(--ui-shade-4)",
                        border: "1px solid var(--ui-shade-6)",
                        color: "var(--ui-shade-7)",
                        fontSize: "0.85rem"
                    }}
                >
                    Checking tablebase...
                </div>
            ) : tablebaseData ? (
                <TablebaseEvaluationWidget
                    pvMoves={tablebaseData.pvMoves}
                    resultText={tablebaseData.resultText}
                    defaultExpanded={true}
                />
            ) : (
                <div
                    style={{
                        padding: "10px 12px",
                        borderRadius: "10px",
                        backgroundColor: "var(--ui-shade-4)",
                        border: "1px solid var(--ui-shade-6)",
                        color: "var(--ui-shade-7)",
                        fontSize: "0.85rem"
                    }}
                >
                    <span style={{ color: "white", fontWeight: 700, marginRight: "6px" }}>
                        Tablebase
                    </span>
                    No tablebase result for this position.
                </div>
            )}
        </div>
    );
}

export default TablebasePositionCard;
