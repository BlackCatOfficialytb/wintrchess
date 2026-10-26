# TablebaseEvaluationWidget

A dark-mode React component for displaying tablebase-generated endgame evaluation data with DTZ (Dividing by Two Moves) scores.

## Features

- ✅ **Responsive Grid Layout** - 3 columns on larger screens, stacks on mobile
- ✅ **Synced with WintrChess Theme** - Uses `--ui-shade` CSS variables
- ✅ **Collapsible** - Click header to expand/collapse
- ✅ **Best Move Highlighting** - Highlight the best move with special styling
- ✅ **TypeScript Ready** - Full type safety with `MoveData` interface

## Theme Integration

### WintrChess Theme Colors

The component uses the WintrChess theme defined in `index.css`:

```css
:root {
    --ui-blue: #467de8;
    --ui-shade-1: #101216;      /* Darkest - primary background */
    --ui-shade-2: #17191e;      /* Lighter dark - cards on hover */
    --ui-shade-3: #1f2125;      /* Card background (main) */
    --ui-shade-4: #2c2f35;      /* Secondary background */
    --ui-shade-5: #3b3e43;      /* Text colors, hover states */
    --ui-shade-6: #3e4349;      /* Borders, inputs */
    --ui-shade-7: #50575f;      /* Lightest */
    --rt-color-dark: #111;
}
```

### Component Color Mapping

| Element | CSS Variable | Hex Value |
|---------|--------------|-----------|
| **Container background** | `--ui-shade-3` | #1f2125 |
| **Header background** | `--ui-shade-3` | #1f2125 |
| **Border color** | `--ui-shade-6` | #3e4349 |
| **Hover border** | `--ui-shade-4` | #2c2f35 |
| **Text (normal)** | `white` | #ffffff |
| **Text (best move)** | `--ui-shade-3` | #1f2125 |
| **Badge (best move)** | `--ui-shade-3` | #1f2125 |
| **Badge (normal)** | `--ui-shade-1` | #101216 |
| **Badge text (best)** | `white` | #ffffff |
| **Badge text (normal)** | `black` | #000000 |
| **Section label** | `--ui-shade-5` | #3b3e43 |
| **Chevron background** | `--ui-shade-5` | #3b3e43 |
| **Result badge** | `var(--ui-shade-1)` | #101216 |

### Existing Components Using This Theme

| Component | CSS Variable Used |
|-----------|-------------------|
| ClassificationCountCard | `--ui-shade-4` (bg), `--ui-shade-6` (border) |
| GameAnalysis | `--ui-shade-2` (bg) |
| RealtimeEngine | `--ui-shade-4` (bg) |
| AccuraciesCard | `--ui-shade-4` (bg) |
| EvaluationGraph | `--ui-shade-4` (bg) |

---

## Installation

Component is self-contained with no external dependencies besides React itself.

```tsx
import { TablebaseEvaluationWidget } from "./components/TablebaseEvaluationWidget";
```

## Props

### TablebaseEvaluationWidgetProps

| Property | Type | Required | Default | Description |
|----------|------|----------|---------|-------------|
| `pvMoves` | `MoveData[]` | No | `[]` | Array of PV moves with move notation and DTZ |
| `resultText` | `string` | No | `"TABLEBASE EVALUATION"` | Result header text (e.g., "WHITE WINS") |
| `defaultExpanded` | `boolean` | No | `false` | Whether widget should be expanded on mount |
| `onToggle` | `() => void` | No | `undefined` | Callback when header is clicked |

### MoveData interface

```typescript
interface MoveData {
    move: string;        // Chess move notation (e.g., "Kc5", "Re1")
    dtz: number;         // DTZ score (Dividing by Two Moves)
    isBest?: boolean;    // Whether this is the best move (border highlighted)
}
```

## Usage Examples

### Basic Usage

```tsx
import { TablebaseEvaluationWidget } from "./components/TablebaseEvaluationWidget";

<TablebaseEvaluationWidget
    pvMoves={[
        { move: "Re6", dtz: 1, isBest: true },   // Best move highlighted
        { move: "Kc5", dtz: 3 },
        { move: "Rf1", dtz: 5 },
    ]}
    resultText="WHITE WINS"
/>
```

### With State Control

```tsx
const [expanded, setExpanded] = useState(false);

<TablebaseEvaluationWidget
    pvMoves={pvMoves}
    resultText="DRAW"
    defaultExpanded={expanded}
    onToggle={() => setExpanded(!expanded)}
/>
```

### Inside Analysis Panel

```tsx
// Inside EngineOptoinsArea or AnalysisPanel
const { getTablebaseResult } = useGameSettings();

{getTablebaseResult && (
    <TablebaseEvaluationWidget
        pvMoves={getTablebaseResult.pv || []}
        resultText={
            getTablebaseResult.win ? 'WHITE WINS' :
            getTablebaseResult.draw ? 'STALEMATE' :
            'BLACK WINS'
        }
    />
)}
```

---

## Visual Styling

### Component Structure

```
┌─────────────────────────────────────────┐
│ Container (ui-shade-3, border: ui-shade-6) │
│ ┌─────────────────────────────────────┐ │
│ │ Header                            │ │
│ │ ├─ Title (white, bold)            │ │
│ │ ├─ Result Badge (ui-shade-1)       │ │
│ │ └─ Chevron (hover: ui-shade-5)    │ │
│ ├─────────────────────────────────────┤ │
│ │ Content (if expanded)              │ │
│ │ ├─ Label (ui-shade-5, uppercase)   │ │
│ │ └─ Grid (responsive)              │ │
│ │    ┌────────────────┐              │ │
│ │    │ RE6    [DTZ1]  │ (best)       │ │
│ │    ├────────────────┤              │ │
│ │    │ KC5    [DTZ3]  │              │ │
│ │    └────────────────┘              │ │
│ └─────────────────────────────────────┘ │
└─────────────────────────────────────────┘
```

### Best Move Card Distinctions

| Property | Best Move | Normal Move |
|----------|-----------|-------------|
| **Background** | `ui-shade-2` | `ui-shade-3` |
| **Border color** | `ui-shade-4` | `ui-shade-6` |
| **Shadow** | `box-shadow: rgba(0,0,0,0.5)` | `none` |
| **Text color** | `ui-shade-3` | `white` |
| **Badge background** | `ui-shade-3` | `ui-shade-1` |
| **Badge text** | `white` | `black` |

---

## Integration with WintrChess Analysis

To integrate with existing analysis flow and tablebase API:

```typescript
import { TablebaseEvaluationWidget } from "../TablebaseEvaluationWidget";

// 1. Fetch tablebase result
const tablebaseResult = await lookupTablebase(fen, {
    timeout: 300,
    multiPv: 5
});

// 2. Convert tablebase result to widget data
const pvMoves: MoveData[] = (tablebaseResult?.pv || []).map((pv, idx) => ({
    move: pv.moves[0]?.san || "",                           // First move in line
    dtz: tablebaseResult.pv[idx]?.score ?? 0,              // DTZ score (centipawns)
    isBest: !!tablebaseResult.bestMove?.san &&
            pv.moves[0]?.san === tablebaseResult.bestMove?.san
    || idx === 0  // First line is always best by default
}));

// 3. Determine result text
const resultText = !tablebaseResult
    ? "TABLEBASE NOT FOUND"
    : tablebaseResult.class === 'loss' ? 'BLACK WINS'
    : tablebaseResult.class === 'draw' ? 'STALEMATE'
    : 'WHITE WINS';

// 4. Render widget
<TablebaseEvaluationWidget
    pvMoves={pvMoves}
    resultText={resultText}
    defaultExpanded={true}
/>
```

### Tablebase API Integration Flow

```typescript
// Step 1: Check if position qualifies for tablebase
if (isTablebasePosition(fen) && options.useTablebases) {
    // Step 2: Fetch from Lichess syzygy API
    const result = await lookupTablebase(fen, options);

    // Step 3: Convert to EngineLine for state tree
    if (result) {
        stateTreeNode.state.engineLines.push({
            evaluation: {
                type: result.dtm ? "mate" : "centipawn",
                value: result.class === "win" && result.dtm
                    ? 10000 * result.dtm  // Approximate mate score
                    : result.score
            },
            source: EngineVersion.EGTB_SYZYGY,
            depth: 1,
            index: 1,
            moves: getTablebaseMoves(result, fen)  // PV generation
        });
    }
}
```

---

## Responsive Design

The component automatically adjusts layout:

| Screen Size | Grid Columns |
|-------------|--------------|
| Mobile (<768px) | 1 column (stacked) |
| Tablet (768px-1024px) | 3 columns |
| Desktop (1024px+) | 3 columns |

### Breakpoint Usage

```css
/* Using Tailwind breakpoints synced with desktop design */
grid-cols-1          /* Mobile */
md:grid-cols-3       /* Tablet + Desktop (>=768px) */
```

---

## Accessibility

- Semantic HTML (`<div role="listitem">`)
- Expandable content (collapsible header)
- Keyboard accessible (ARIA labels `aria-label="Expand"|"Collapse"`)
- Focus states on interactive elements
- High contrast text for readability

## Testing

The component can be tested with different data sets:

```tsx
import * as stories from "./example";

// Test states:
// - Empty pvMoves
// - Single move with best: true
// - Multiple moves, best and regular
// - Large pv list (generate programmatically)
// - Long FEN strings truncation
```

## Performance

- Minimal re-renders (memo component not needed)
- Fixed DOM structure (no loop frame drops)
- Inline styles for consistency with theme

## Future Enhancements (Phase 2)

- Display exact move counts with hover tooltips
- Add depth/mate information to header
- Support move-specific analysis tooltips
- Integrate with game history navigation
- Add ETA counter for forced win

---

## Files

```
TablebaseEvaluationWidget/
├── index.tsx          # Main component (React + WintrChess theme)
├── index.ts           # Export file
├── example.tsx        # Usage examples
└── README.md          # Documentation
```

---

## Complete Example Integration

```tsx
import React, { useState, useEffect } from "react";
import { TablebaseEvaluationWidget } from "../TablebaseEvaluationWidget";
import { lookupTablebase, isTablebasePosition } from "shared/lib/tablebaseLookup";

interface MatchProp {
    fen: string;
    result?: string;
}

const MatchScoreboard: React.FC<MatchProp> = ({ fen, result = "UNKNOWN" }) => {
    const [tablebaseResult, setTablebaseResult] = useState<any>(null);
    const [expanded, setExpanded] = useState(true);

    useEffect(() => {
        async function loadTablebase() {
            if (!isTablebasePosition(fen)) {
                setTablebaseResult(null);
                return;
            }

            try {
                const result = await lookupTablebase(fen, { timeout: 300, multiPv: 6 });
                setTablebaseResult(result);
            } catch (error) {
                console.error("Tablebase lookup failed:", error);
                setTablebaseResult(null);
            }
        }

        loadTablebase();
    }, [fen]);

    if (!tablebaseResult) {
        return null;
    }

    const pvMoves = (tablebaseResult.pv || []).map((pv: any, idx: number) => ({
        move: pv.moves[0]?.san || "",
        dtz: tablebaseResult.pv[idx]?.score ?? 0,
        isBest: idx === 0 || pv.moves[0]?.san === tablebaseResult.bestMove?.san
    }));

    const resultText = tablebaseResult.class === 'loss' ? 'BLACK WINS'
                : tablebaseResult.class === 'draw' ? 'STALEMATE'
                : 'WHITE WINS';

    return (
        <div className="mb-4">
            <h4 className="text-white font-bold mb-2">Tablebase Analysis</h4>
            <TablebaseEvaluationWidget
                pvMoves={pvMoves}
                resultText={resultText}
                defaultExpanded={expanded}
                onToggle={() => setExpanded(!expanded)}
            />
        </div>
    );
};

export default MatchScoreboard;
```