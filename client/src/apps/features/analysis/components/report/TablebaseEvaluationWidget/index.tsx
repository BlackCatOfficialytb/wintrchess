import React, { useState } from "react";

interface MoveData {
    move: string;
    dtz: number;
    /** Exact distance to mate, when the tablebase provides one */
    dtm?: number;
    isBest?: boolean;
}

interface TablebaseEvaluationWidgetProps {
    pvMoves: MoveData[];
    resultText: string;
    /** Top-level DTM shown in the header when either side is winning */
    dtm?: number;
    defaultExpanded?: boolean;
    onToggle?: () => void;
}

/**
 * Tablebase Evaluation Widget
 *
 * Displays tablebase-generated variations for endgame positions with
 * DTZ (Dividing by Zeroing Moves) evaluations.
 *
 * Theme tokens (dark mode):
 * - Card background:  var(--ui-shade-4) #2c2f35
 * - Row background:   var(--ui-shade-2) #17191e
 * - Accent row bg:    var(--ui-shade-6) #3e4349
 * - Borders:          var(--ui-shade-6), accent var(--ui-shade-7)
 * - Muted text:       var(--ui-shade-7) #50575f
 * - Primary/badge text: white / var(--ui-shade-1) on white badge
 */
const TablebaseEvaluationWidget: React.FC<TablebaseEvaluationWidgetProps> = ({
    pvMoves = [],
    resultText = "TABLEBASE EVALUATION",
    dtm,
    defaultExpanded = false,
    onToggle
}) => {
    const [isExpanded, setIsExpanded] = useState(defaultExpanded);

    const toggleExpanded = () => {
        setIsExpanded(!isExpanded);
        onToggle?.();
    };

    return (
        <div
            style={{
                width: "100%",
                boxSizing: "border-box",
                borderRadius: "10px",
                backgroundColor: "var(--ui-shade-4)",
                border: "1px solid var(--ui-shade-6)",
                overflow: "hidden"
            }}
        >
            {/* Header */}
            <div
                onClick={toggleExpanded}
                style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "8px",
                    padding: "10px 12px",
                    cursor: "pointer",
                    borderBottom: isExpanded
                        ? "1px solid var(--ui-shade-6)"
                        : "none"
                }}
            >
                <div style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    minWidth: 0
                }}>
                    <span style={{
                        color: "white",
                        fontWeight: 700,
                        fontSize: "0.95rem",
                        fontFamily: "var(--ui-font)"
                    }}>
                        Tablebase
                    </span>
                    <span style={{
                        flexShrink: 1,
                        minWidth: 0,
                        maxWidth: "100%",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        padding: "3px 10px",
                        borderRadius: "999px",
                        border: "1px solid var(--ui-shade-6)",
                        backgroundColor: "var(--ui-shade-2)",
                        color: "white",
                        fontWeight: 700,
                        fontSize: "11px",
                        letterSpacing: "0.3px"
                    }}>
                        {resultText}
                    </span>
                    {dtm !== undefined && (
                        <span style={{
                            flexShrink: 0,
                            padding: "3px 10px",
                            borderRadius: "999px",
                            backgroundColor: "white",
                            color: "var(--ui-shade-1)",
                            fontWeight: 700,
                            fontSize: "11px",
                            letterSpacing: "0.3px",
                            whiteSpace: "nowrap"
                        }}>
                            DTM {dtm}
                        </span>
                    )}
                </div>
                <button
                    onClick={event => {
                        event.stopPropagation();
                        toggleExpanded();
                    }}
                    aria-label={isExpanded ? "Collapse" : "Expand"}
                    style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        width: "24px",
                        height: "24px",
                        flexShrink: 0,
                        padding: 0,
                        border: "none",
                        borderRadius: "6px",
                        backgroundColor: "transparent",
                        color: "var(--ui-shade-7)",
                        cursor: "pointer"
                    }}
                    onMouseOver={event => {
                        event.currentTarget.style.color = "white";
                    }}
                    onMouseOut={event => {
                        event.currentTarget.style.color = "var(--ui-shade-7)";
                    }}
                >
                    {/* Chevron, rotates when expanded */}
                    <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        style={{
                            transform: isExpanded
                                ? "rotate(180deg)"
                                : "rotate(0deg)",
                            transition: "transform 0.15s ease"
                        }}
                    >
                        <path d="M6 9l6 6 6-6" />
                    </svg>
                </button>
            </div>

            {/* Expanded content */}
            {isExpanded && (
                <div style={{ padding: "10px 12px 12px 12px" }}>
                    <div style={{
                        marginBottom: "8px",
                        color: "var(--ui-shade-7)",
                        fontWeight: 600,
                        fontSize: "10px",
                        letterSpacing: "0.8px",
                        textTransform: "uppercase"
                    }}>
                        Principal Variations
                    </div>

                    {pvMoves.length > 0 ? (
                        <div
                            role="list"
                            style={{
                                display: "grid",
                                gridTemplateColumns:
                                    "repeat(auto-fill, minmax(200px, 1fr))",
                                gap: "8px"
                            }}
                        >
                            {pvMoves.map((moveItem, index) => (
                                <div
                                    key={index}
                                    role="listitem"
                                    style={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: "8px",
                                        padding: "8px 10px",
                                        borderRadius: "8px",
                                        backgroundColor: moveItem.isBest
                                            ? "var(--ui-shade-6)"
                                            : "var(--ui-shade-2)",
                                        border: `1px solid ${
                                            moveItem.isBest
                                                ? "var(--ui-shade-7)"
                                                : "var(--ui-shade-6)"
                                        }`
                                    }}
                                >
                                    {/* Move notation */}
                                    <span
                                        title={moveItem.move}
                                        style={{
                                            flex: "1 1 0",
                                            minWidth: 0,
                                            overflow: "hidden",
                                            whiteSpace: "nowrap",
                                            textOverflow: "ellipsis",
                                            color: "white",
                                            fontWeight: 700,
                                            fontSize: "0.9rem",
                                            fontFamily: "var(--ui-font)"
                                        }}
                                    >
                                        {moveItem.move}
                                    </span>

                                    {/* DTZ badge */}
                                    <span style={{
                                        flexShrink: 0,
                                        padding: "3px 8px",
                                        borderRadius: "999px",
                                        backgroundColor: moveItem.isBest
                                            ? "white"
                                            : "var(--ui-shade-5)",
                                        color: moveItem.isBest
                                            ? "var(--ui-shade-1)"
                                            : "white",
                                        fontWeight: 700,
                                        fontSize: "11px",
                                        whiteSpace: "nowrap"
                                    }}>
                                        DTZ {moveItem.dtz}
                                    </span>

                                    {/* DTM badge, exact mate distance when provided */}
                                    {moveItem.dtm !== undefined && (
                                        <span style={{
                                            flexShrink: 0,
                                            padding: "3px 8px",
                                            borderRadius: "999px",
                                            backgroundColor: "var(--ui-shade-2)",
                                            border: "1px solid var(--ui-shade-6)",
                                            color: "white",
                                            fontWeight: 700,
                                            fontSize: "11px",
                                            whiteSpace: "nowrap"
                                        }}>
                                            DTM {moveItem.dtm}
                                        </span>
                                    )}
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div
                            style={{
                                color: "var(--ui-shade-7)",
                                fontSize: "0.85rem"
                            }}
                        >
                            No tablebase variations available
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export type { TablebaseEvaluationWidgetProps, MoveData };
export default TablebaseEvaluationWidget;
