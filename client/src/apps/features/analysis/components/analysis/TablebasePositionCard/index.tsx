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
    dtm?: number;
    isBest: boolean;
}

interface TablebaseDisplayData {
    pvMoves: PVType[];
    resultText: string;
    /** Exact distance to mate shown in the header, when winning */
    dtm?: number;
}

const VARIATION_COUNT = 6;

function getTablebaseDisplayData(
    result: TablebaseResult,
    fen: string
): TablebaseDisplayData {
    const decisive =
        result.category == "win"
        || result.category == "loss"
        || result.category == "maybe-win"
        || result.category == "maybe-loss"
        || result.category == "cursed-win";

    return {
        pvMoves: result.moves
            .slice(0, VARIATION_COUNT)
            .map((rate, index) => ({
                move: rate.san,
                // Signed dtz/dtm values are negative for losing variations
                dtz: Math.abs(rate.dtz ?? rate.dtm ?? 0),
                dtm: rate.dtm !== undefined
                    ? Math.abs(rate.dtm)
                    : undefined,
                isBest: index == 0
            })),
        resultText: formatTablebaseResult(result, fen),
        // dtm is only provided by the tablebase for <= 5-piece positions
        dtm: decisive && result.dtm !== undefined
            ? Math.abs(result.dtm)
            : undefined
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
                    dtm={tablebaseData.dtm}
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
