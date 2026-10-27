# Tablebase Evaluation Widget

Dark-mode React component for displaying syzygy tablebase evaluation data
(DTZ scores and legal move variations) for endgame positions with 7 pieces
or fewer.

## Theme

The component uses WintrChess theme CSS variables:

| Element | Variable |
|---------|----------|
| Card background | `--ui-shade-3` |
| Best-move background | `--ui-shade-2` |
| Badge background | `--ui-shade-1` |
| Borders | `--ui-shade-6` / `--ui-shade-4` |
| Muted text | `--ui-shade-5` |
| Font | `--ui-font` |

## Props

```ts
interface TablebaseEvaluationWidgetProps {
    /** Legal moves ranked best-first, produced by the tablebase client */
    pvMoves: MoveData[];
    /** Result text, e.g. "WHITE WINS IN 16", "TABLEBASE DRAWS" */
    resultText: string;
    defaultExpanded?: boolean;
    onToggle?: () => void;
}
```

```ts
interface MoveData {
    move: string;   // SAN notation
    dtz: number;    // DTZ (absolute value); 0 for draws
    isBest?: boolean;
}
```

## Data source

All data comes from `shared/src/lib/tablebaseLookup.ts`, which queries the
[lila-tablebase HTTP API](https://github.com/lichess-org/lila-tablebase):

```
GET https://tablebase.lichess.org/standard?fen=<fen>
```

Verified response mapping:

| API field | Used for |
|-----------|----------|
| `category` | `win` / `draw` / `loss` / `unknown` / `maybe-win` / `maybe-loss` / `cursed-win` / `blessed-loss` |
| `dtz`, `dtm` | Mate-in-N display (`dtm` only for <= 5 pieces) |
| `checkmate`, `stalemate` | Terminal position labels |
| `moves[]` (best-first) | `pvMoves` (`san`, `dtz`, `category`) |

Helpers exported by the shared module:

- `isTablebasePosition(fen)` — counts piece letters in the FEN board field.
- `lookupTablebase(fen, { baseUrl?, timeout? })` — promise-based lookup
  (2s default timeout; `undefined` for ineligible/unreachable positions).
- `formatTablebaseResult(result, fen)` — result text from white's viewpoint.
- `getTablebaseResultEvaluation(result, fen)` /
  `getTablebaseMoveEvaluation(move, fen)` — white-POV `Evaluation`
  (`mate` when dtm/dtz available, `centipawn` 0 for draws and
  50-move bounded results).

## Consumers

- `GameReport` — fetches tablebase data for the current board position
  and renders this widget.
- `lib/evaluate.ts` — adds `EngineVersion.EGTB_SYZYGY` engine lines
  (with real `san`/`uci` move lists) from the first tablebase response,
  falling back to cloud evaluation and local engines.
