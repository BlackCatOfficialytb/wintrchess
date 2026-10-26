import React, { useState } from "react";
import TablebaseEvaluationWidget from "./index";

interface MoveData {
    move: string;
    dtz: number;
    isBest?: boolean;
}

/** Example usage of TablebaseEvaluationWidget */
export const Example1_WhiteWin = () => (
    <TablebaseEvaluationWidget
        pvMoves={[
            { move: "Re1", dtz: 34, isBest: true },
            { move: "Kc4", dtz: 36 },
            { move: "Rf1", dtz: 38 },
            { move: "Kd3", dtz: 40 },
        ]}
        resultText="WHITE WINS"
        defaultExpanded={true}
    />
);

export const Example2_Draw = () => (
    <TablebaseEvaluationWidget
        pvMoves={[
            { move: "Kd2", dtz: 0 },
            { move: "Ke3", dtz: 0 },
            { move: "Kf4", dtz: 0 },
            { move: "Kd1", dtz: 0 },
        ]}
        resultText="STALEMATE"
        defaultExpanded={false}
    />
);

export const Example5_StateManagement = () => {
    const [expanded, setExpanded] = useState(false);

    const [pvMoves, setPvMoves] = useState<Array<MoveData>>([
        { move: "Re6", dtz: 1, isBest: true },
        { move: "Kc5", dtz: 3 },
        { move: "Rf1", dtz: 5 },
        { move: "Kd4", dtz: 7 },
        { move: "Rd5", dtz: 7 },
        { move: "Kc3", dtz: 7 },
    ]);

    return (
        <div style={{ backgroundColor: 'var(--ui-shade-3)', padding: '24px', borderRadius: '8px', border: '1px solid var(--ui-shade-6)' }}>
            <h4 style={{ color: 'white', fontWeight: 'bold', marginBottom: '16px' }}>Example with State Management</h4>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                <button
                    onClick={() => setExpanded(!expanded)}
                    style={{
                        backgroundColor: 'var(--ui-shade-5)',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        padding: '8px 16px',
                        cursor: 'pointer'
                    }}
                >
                    Toggle Expanded
                </button>
            </div>
            <TablebaseEvaluationWidget
                pvMoves={pvMoves}
                resultText="DRAW"
                defaultExpanded={expanded}
            />
        </div>
    );
};