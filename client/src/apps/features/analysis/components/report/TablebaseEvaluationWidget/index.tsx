import React, { useState } from "react";

interface MoveData {
    move: string;
    dtz: number;
    isBest?: boolean;
}

interface TablebaseEvaluationWidgetProps {
    pvMoves: MoveData[];
    resultText: string;
    defaultExpanded?: boolean;
    onToggle?: () => void;
}

/**
 * Tablebase Evaluation Widget
 *
 * Displays tablebase-generated PV lines for endgame positions with
 * DTZ (Dividing by Two Moves) evaluations.
 *
 * Uses the WintrChess theme:
 * - Background: var(--ui-shade-3) #1f2125
 * - Borders: var(--ui-shade-6) #3e4349
 * - Text: white, lighter grays
 */
const TablebaseEvaluationWidget: React.FC<TablebaseEvaluationWidgetProps> = ({
    pvMoves = [],
    resultText = "TABLEBASE EVALUATION",
    defaultExpanded = false,
    onToggle
}) => {
    const [isExpanded, setIsExpanded] = useState(defaultExpanded);

    const toggleExpanded = () => {
        setIsExpanded(!isExpanded);
        onToggle?.();
    };

    return (
        <div className="w-full rounded-lg border shadow-sm" style={{ backgroundColor: 'var(--ui-shade-3)' }}>
            {/* Header */}
            <div
                className="px-4 py-3 border-b flex items-center justify-between cursor-pointer hover:opacity-80"
            >
                <div className="flex items-center gap-3">
                    <h3 className="text-sm font-bold text-white" style={{ fontFamily: 'var(--ui-font)' }}>
                        Tablebase
                    </h3>
                    <span className="px-2.5 py-1 text-xs font-bold text-black rounded-full" style={{ backgroundColor: 'var(--ui-shade-1)' }}>
                        {resultText}
                    </span>
                </div>
                <button
                    onClick={toggleExpanded}
                    className="p-1 hover:bg-opacity-50 rounded transition-colors text-zinc-400 hover:text-white"
                    style={{ backgroundColor: 'var(--ui-shade-5)' }}
                    aria-label={isExpanded ? "Collapse" : "Expand"}
                >
                    {/* Chevron Up Icon */}
                    <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    >
                        <path d="M18 15l-6-6-6 6" />
                    </svg>
                </button>
            </div>

            {/* Expanded Content */}
            {isExpanded && pvMoves.length > 0 && (
                <div className="p-4">
                    <div>
                        <p
                            className="text-xs mb-3 font-semibold uppercase tracking-wide"
                            style={{ color: 'var(--ui-shade-5)' }}
                        >
                            Principal Variations (PV)
                        </p>

                        {/* Responsive Grid Layout */}
                        <div
                            className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-3 gap-3"
                            role="list"
                        >
                            {pvMoves.map((moveItem, index) => (
                                <div
                                    key={index}
                                    className={`p-3 border rounded-md transition-colors flex items-center justify-between gap-2
                                        ${moveItem.isBest
                                            ? ''
                                            : ''
                                        }`}
                                    style={{
                                        backgroundColor: moveItem.isBest ? 'var(--ui-shade-2)' : 'var(--ui-shade-3)',
                                        borderColor: moveItem.isBest ? 'var(--ui-shade-4)' : 'var(--ui-shade-6)',
                                        boxShadow: moveItem.isBest ? '0 4px 6px -1px rgba(0,0,0,0.5)' : 'none'
                                    }}
                                    role="listitem"
                                >
                                    {/* Left side: Move notation */}
                                    <span
                                        className="text-sm font-bold"
                                        style={{
                                            color: moveItem.isBest ? 'var(--ui-shade-3)' : 'white',
                                            fontFamily: 'var(--ui-font)'
                                        }}
                                    >
                                        {moveItem.move}
                                    </span>

                                    {/* Right side: DTZ Badge */}
                                    <span
                                        className="px-2 py-1 text-xs font-bold rounded-full"
                                        style={{
                                            backgroundColor: moveItem.isBest ? 'var(--ui-shade-3)' : 'var(--ui-shade-1)',
                                            color: moveItem.isBest ? 'white' : 'black',
                                            fontSize: '11px'
                                        }}
                                    >
                                        DTZ {moveItem.dtz}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {isExpanded && pvMoves.length === 0 && (
                <div className="p-4">
                    <p
                        className="text-sm italic"
                        style={{ color: 'var(--ui-shade-5)' }}
                    >
                        No tablebase variations available
                    </p>
                </div>
            )}
        </div>
    );
};

export type { TablebaseEvaluationWidgetProps, MoveData };
export default TablebaseEvaluationWidget;