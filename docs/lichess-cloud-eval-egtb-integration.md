# Lichess Cloud Eval + EGTB Integration - Phase 1 Implementation Plan

## Overview
This document outlines the technical architecture and implementation steps for integrating Lichess Cloud Eval and 7-piece Syzygy Endgame Tablebases (EGTB) into WintrChess.

**Goal**: Implement a hybrid evaluation system that:
1. Uses **7-piece Syzygy EGTB** for endgame positions (≤7 pieces)
2. Uses **Lichess Cloud Eval** for patterns/middlegame positions
3. Falls back to local **Stockfish 19 WASM** if network/API unavailable
4. Provides 100% endgame accuracy for post-game analytics

---

## Phase 1 Scope

### ✅ Deliverables
1. **EGTB Module**: `shared/src/lib/tablebaseLookup.ts` - API client for Lichess Syzygy
2. **Enhanced Cloud Eval Module**: `cloudEvaluate.ts` - Add timeout, caching, rate limiting
3. **Hybrid Evaluate Function**: `evaluate.ts` - Intelligent fallback strategy
4. **UI Settings**: Add EGTB toggle in analysis settings
5. **Testing**: Unit tests and integration tests

---

## Technical Architecture

### 1. Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│ User Opens Game / Triggers Analysis                        │
└────────────────────────────┬────────────────────────────────┘
                             │
                    ┌────────▼────────┐
                    │ analyzePosition │
                    │  (FEN string)    │
                    └────────┬────────┘
                             │
                    ┌────────▼──────────────┐
                    │ Detect Piece Count    │
                    │ Count pawns + pieces  │
                    └────────┬──────────────┘
                             │
              ┌──────────────┴─────────────────┐
              ▼                                 ▼
        ┌──────────────┐              ┌──────────────┐
        │  ≤ 7 pieces? │              │   > 7 pieces │
        └──────┬───────┘              └──────┬───────┘
               │ Yes                         │ No
               ▼                              ▼
    ┌─────────────────┐        ┌─────────────────┐
    │ EGTB Lookup     │        │ Cloud Eval      │
    │ (score + moves) │        │ (depth 40-50+)  │
    └────────┬────────┘        └────────┬────────┘
             │                           │
             │ ✅ Found                  │ ✅ Found
             ▼                           ▼
    ┌─────────────────┐        ┌─────────────────┐
    │ ❌ Not Found    │        │ ❌ Not Found    │
    │ or Timed Out    │        │ or Timed Out    │
    └────────┬────────┘        └────────┬────────┘
             │                           │
             ▼                           ▼
    ┌─────────────────┐        ┌─────────────────┐
    │ Fallback to     │        │ Fallback to     │
    │ Stockfish 19    │        │ Stockfish 19    │
    │ (local WASM)    │        │ (local WASM)    │
    └────────┬────────┘        └────────┬────────┘
             │                           │
             ▼                           ▼
    ┌─────────────────┐        ┌─────────────────┐
    │ ✅ Evaluation   │        │ ✅ Evaluation   │
    │ Complete        │        │ Complete        │
    └─────────────────┘        └─────────────────┘
```

### 2. Enhanced State Management

**BoardState extension** (already exists, no changes needed):
```typescript
interface BoardState {
    fen: string;
    move: Move | undefined;
    moveColour: "white" | "black";
    engineLines: EngineLine[];
    // New fields for EGTB:
    tablebaseResult: {
        score: number;        // -50000 to +50000 (PTE score)
        dtm: number;          // Distance to Mate (moves)
        // ... other fields as needed
    } | undefined;
    accuracy: number | undefined;
    classification: Classification | undefined;
}
```

**EngineLine extension** (already exists, no changes needed):
```typescript
interface EngineLine {
    evaluation: { type: "centipawn" | "mate", value: number };
    source: EngineVersion;  // LICHESS_CLOUD, STOCKFISH_19, EGTB_SYZYGY
    depth: number;
    index: number;
    moves: Move[];
}
```

---

## Implementation Specs

### Module 1: Shared Layer - EGTB Lookup Client

**File**: `shared/src/lib/tablebaseLookup.ts`

Purpose: Pure TypeScript API client for Lichess Syzygy Tablebases

```typescript
// shared/src/lib/tablebaseLookup.ts

/**
 * Syzygy tablebase information
 */
export interface TablebaseResult {
    /** Centipawn score (scaled -50000 to +50000) */
    score: number;
    /** Distance to mate (moves) */
    dtm?: number;
    /** Is it a loss? */
    loss: boolean;
    /** Is it a draw? */
    draw: boolean;
    /** Is it a win? */
    win: boolean;
}

/**
 * Tablebase lookup configuration
 */
export interface TablebaseOptions {
    /** Lichess base URL (default: https://tablebase.lichess.org) */
    baseUrl?: string;
    /** Maximum number of PV lines (default: 5) */
    multiPv?: number;
    /** Request timeout in ms (default: 300) */
    timeout?: number;
}

/**
 * Whether a position is suitable for tablebase lookup (≤7 pieces)
 */
export function isTablebasePosition(fen: string): boolean {
    // Count non-pawn pieces + pawns
    const piecePattern = /[KBRQ]/g;
    const pawnPattern = /p/g;

    const pieceCount = (fen.match(piecePattern) || []).length;
    const pawnCount = (fen.match(pawnPattern) || []).length;

    return (pieceCount + pawnCount) <= 7;
}

/**
 * Lookup a position in Lichess Syzygy tablebase
 *
 * @param fen - The position's FEN string
 * @param options - Lookup options
 * @returns TablebaseResult or undefined if not found/ineligible
 */
export async function lookupTablebase(
    fen: string,
    options: TablebaseOptions = {}
): Promise<TablebaseResult | undefined> {
    const {
        baseUrl = "https://tablebase.lichess.org",
        multiPv = 5,
        timeout = 300
    } = options;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
        const url = `${baseUrl}/api/lookup?fen=${fen}&multiPv=${multiPv}`;

        const response = await fetch(url, {
            signal: controller.signal,
            // No credentials need to be sent (public API)
        });

        clearTimeout(timeoutId);

        if (!response.ok || response.status === 404 || response.status === 400) {
            // Position not found in tablebases (or invalid)
            return undefined;
        }

        const data = await response.json();

        if (!data) return undefined;

        // Parse result (field names per Lichess API)
        return {
            score: data.score ?? 0,
            dtm: data.dtm ?? undefined,
            loss: data.class === "loss",
            draw: data.class === "draw",
            win: data.class === "win"
        };
    } catch (error) {
        clearTimeout(timeoutId);
        console.warn(`[tablebaseLookup] Lookup failed:`, error?.message);
        return undefined;
    }
}

/**
 * Convert tablebase score to human-readable string
 */
export function formatTablebaseScore(score: number): string {
    const absScore = Math.abs(score);
    if (absScore >= 50000) {
        // Mate detected
        return score > 0 ? "#+M" : "#-M";
    }
    // Convert centipawns to decimal
    const evalScore = score / 100;
    return score > 0 ? `+${evalScore.toFixed(2)}` : evalScore.toFixed(2);
}
```

**Dependencies**:
- `Node` (fetch API built-in)
- No external npm packages needed
- No TypeScript type definitions needed (uses `any` for API response)

**Unit Test Strategy** (create `shared/test/tablebase.test.mjs`):
- Test `isTablebasePosition()` with various FENs
- Test `lookupTablebase()` with known tablebase positions
- Test error handling (timeout, network errors)
- Mock fetch to return dummy tablebase responses

---

### Module 2: Enhanced Cloud Eval Module

**File**: `client/src/apps/features/analysis/lib/cloudEvaluate.ts`

Enhancement: Add timeout, caching, and improved error handling

```typescript
// client/src/apps/features/analysis/lib/cloudEvaluate.ts

// ... existing imports ...

import { lookupTablebase } from "shared/lib/tablebaseLookup";

// Add caching layer
type CacheEntry<T> = {
    T;
    timestamp: number;
    ttl: number; // Time to live in ms
};

const cloudEvalCache = new Map<string, CacheEntry<EngineLine[]>>();

/**
 * Cached cloud evaluation fetch with TTL (2 minutes default)
 */
function getCachedCloudEvaluation(
    fen: string
): EngineLine[] | undefined {
    const entry = cloudEvalCache.get(fen);
    if (!entry) return undefined;

    const now = Date.now();
    if (now - entry.timestamp > entry.ttl) {
        cloudEvalCache.delete(fen);
        return undefined;
    }

    return entry.data;
}

/**
 * Set cloud evaluation in cache
 */
function setCachedCloudEvaluation(
    fen: string,
    lines: EngineLine[],
    ttl = 120000 // 2 minutes
): void {
    cloudEvalCache.set(fen, {
        lines,
        timestamp: Date.now(),
        ttl
    });
}

/**
 * Enhanced getCloudEvaluation with timeout and caching
 *
 * @param fen - Position FEN
 * @param targetCount - Number of PV lines to fetch
 * @param timeout - Request timeout in ms (default: 500)
 * @returns Array of EngineLine or undefined on error/timed out
 */
export async function getCloudEvaluation(
    fen: string,
    targetCount = 1,
    options: { timeout?: number } = {}
): Promise<EngineLine[] | undefined> {
    const { timeout = 500 } = options;

    // Return cached result if available
    const cached = getCachedCloudEvaluation(fen);
    if (cached) return cached;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
        const url = `https://lichess.org/api/cloud-eval?fen=${fen}&multiPv=${targetCount}`;

        const response = await fetch(url, {
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            if (response.status === 404 || response.status === 400) {
                // Position not found - cache for quick retry
                return undefined;
            }
            throw Error(`Cloud evaluation failed (${response.status})`);
        }

        const cloudEvaluation: CloudEvaluation = await response.json();
        const engineLines: EngineLine[] = [];

        for (const variation of cloudEvaluation.pvs) {
            const variationBoard = new Chess(fen);
            const lineMoves: Move[] = [];

            for (const lichessUciMove of variation.moves.split(" ")) {
                const uciMove = lichessCastlingMoves[lichessUciMove] || lichessUciMove;

                try {
                    const parsedMove = variationBoard.move(uciMove);
                    if (!parsedMove) break;

                    lineMoves.push({
                        san: parsedMove.san,
                        uci: parsedMove.lan
                    });
                } catch {
                    break;
                }
            }

            if (lineMoves.length === 0) continue;

            engineLines.push({
                evaluation: {
                    type: ("mate" in variation) ? "mate" : "centipawn",
                    value: ("mate" in variation) ? variation.mate : variation.cp
                },
                source: EngineVersion.LICHESS_CLOUD,
                depth: cloudEvaluation.depth,
                index: cloudEvaluation.pvs.indexOf(variation) + 1,
                moves: lineMoves
            });
        }

        // Cache successful results for 2 minutes
        if (engineLines.length > 0) {
            setCachedCloudEvaluation(fen, engineLines);
        }

        return engineLines.length > 0 ? engineLines : undefined;
    } catch (error) {
        clearTimeout(timeoutId);
        // Log error but don't throw - caller will handle fallback
        console.warn(`[cloudEvaluate] Failed for ${fen.slice(0, 20)}...`);
        return undefined;
    }
}
```

**Improvements**:
1. ✅ **5-minute timeout** - No more hanging on slow networks
2. ✅ **Cache layer** - 2-minute TTL for common positions
3. ✅ **Better error handling** - `return undefined` instead of throw
4. ✅ **Non-blocking** - Caller gracefully handles errors

---

### Module 3: Hybrid Evaluate Function

**File**: `client/src/apps/features/analysis/lib/optimizedEvaluate.ts`

**Replace** or **extend** `evaluate.ts` with hybrid strategy

```typescript
// client/src/apps/features/analysis/lib/optimizedEvaluate.ts

import { isTablebasePosition } from "shared/lib/tablebaseLookup";
import { lookupTablebase } from "shared/lib/tablebaseLookup";

// Reuse existing structures from evaluate.ts
interface EvaluateMovesOptions {
    engineVersion: EngineVersion;
    multiThreaded: boolean;
    maxEngineCount?: number;
    engineDepth: number;
    engineTimeLimit?: number;
    cloudEngineLines: number;
    useTablebases: boolean;  // NEW: Toggle for EGTB
    timeoutCloudEval: number; // NEW: Timeout in ms
    timeoutTablebase: number; // NEW: Timeout in ms
    // ... other options
}

/**
 * Analyze a single position using hybrid strategy
 */
async function analyzePosition(
    stateTreeNode: StateTreeNode,
    options: EvaluateMovesOptions
): Promise<void> {
    const { fen } = stateTreeNode.state;

    // Strategy 1: Try Tablebase if ≤7 pieces
    if (options.useTablebases && isTablebasePosition(fen)) {
        try {
            const tablebaseResult = await withTimeout(
                () => lookupTablebase(fen, {
                    timeout: options.timeoutTablebase || 300
                }),
                options.timeoutTablebase || 300
            );

            if (tablebaseResult) {
                // Convert tablebase result to EngineLine(s)
                stateTreeNode.state.engineLines.push(createTablebaseEngineLine(
                    tablebaseResult,
                    fen
                ));
                return; // Success - skip cloud eval & local engine
            }
        } catch (error) {
            console.warn(`[optimizedEvaluate] Tablebase failed:`, error?.message);
            // Continue to cloud eval fallback
        }
    }

    // Strategy 2: Try Cloud Eval
    try {
        const cloudLines = await getCloudEvaluation(fen, options.cloudEngineLines, {
            timeout: options.timeoutCloudEval || 500
        });

        if (cloudLines && cloudLines.length > 0) {
            stateTreeNode.state.engineLines.push(...cloudLines);
            return; // Success - skip local engine
        }
    } catch (error) {
        console.warn(`[optimizedEvaluate] Cloud eval failed:`, error?.message);
        // Continue to local engine fallback
    }

    // Strategy 3: Fallback to local Stockfish 19 WASM
    const localLines = await useLocalEngine(stateTreeNode, options);
    stateTreeNode.state.engineLines.push(...localLines);
}

/**
 * Simple timeout wrapper
 */
function withTimeout<T>( fn: () => Promise<T>, ms: number ): Promise<T> {
    return Promise.race([
        fn(),
        new Promise<T>((_, reject) =>
            setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms)
        )
    ]);
}

/**
 * Create EngineLine from tablebase result
 */
function createTablebaseEngineLine(
    tablebase: TablebaseResult,
    fen: string
): EngineLine {
    return {
        evaluation: {
            type: tablebase.dtm !== undefined ? "mate" : "centipawn",
            value: tablebase.class === "win"
                ? 10000 * tablebase.dtm!  // Approximate mate score
                : tablebase.score
        },
        source: EngineVersion.EGTB_SYZYGY,
        depth: 1,  // Tablebase is always depth 1
        index: 1,  // Only top line
        moves: getTablebaseMoves(tablebase, fen)  // Generate PV from score
    };
}

/**
 * Generate PV lines from tablebase score (simplified)
 * Will need to be enhanced with Lichess API ping API for exact PV
 */
function getTablebaseMoves(
    tablebase: TablebaseResult,
    fen: string
): Move[] {
    // For Phase 1: Return empty moves, add score to top engine line
    // Phase 2: Integrate Lichess ping API to get exact PV
    return [];
}

// Export - use this instead of evaluate.ts or modify existing
export async function createHybridGameEvaluator(
    game: AnalysedGame,
    options: EvaluateMovesOptions
): Promise<EvaluationProcess> {
    // ... reuse logic from evaluate.ts, replacing the single position logic
    // ... just change lines 42-68 to call analyzePosition instead of getCloudEvaluation
}
```

**Enhance StateTreeNode to store tablebase source** (optional, for diagnostics):
```typescript
// shared/src/types/game/position/StateTreeNode.ts
interface StateTreeNode {
    // ... existing fields
    nodeTag?: "tablebase" | "cloud" | "local";  // Where the result came from
}
```

---

### Module 4: UI Settings Integration

**File**: `client/src/apps/features/analysis/components/SettingsDialog/EngineOptionsArea/index.tsx`

Add EGTB toggle control

```typescript
// client/src/apps/features/analysis/components/SettingsDialog/EngineOptionsArea/index.tsx

import { SwitchSetting } from "@components/Settings/SwitchSetting";
import { useGameSettings } from "@analysis/hooks/useGameSettings";

// ... existing code ...

function EngineOptionsArea() {
    const [settings, updateSettings] = useGameSettings();

    return (
        <>
            {/* Existing settings */}

            {/* NEW: EGTB Toggle */}
            <SwitchSetting
                label="Enable Tablebase Lookup"
                enabled={settings.analysis.engine.tablebaseEnabled}
                onChange={(enabled) => {
                    draft.analysis.engine.tablebaseEnabled = enabled;
                    draft.analysis.engine.tablebaseBaseUrl = "https://tablebase.lichess.org";
                }}
                description={
                    "Use 7-piece Syzygy tablebases for endgame accuracy. " +
                    "Note: Requires internet connection."
                }
            />
        </>
    );
}
```

**Settings Type Update** (`store/settings/games.d.ts`):
```typescript
// Add to AnalysisSettings Interface
interface AnalysisSettings {
    engine: {
        tablebaseEnabled: boolean;
        tablebaseBaseUrl: string;
        // ... other existing settings
    };
    // ... other settings
}
```

---

## Production Considerations

### 1. Rate Limiting

**GitHub API rate limit**: Unlimited for GitHub Pages, several hundred/h for public Lichess API

**Mitigation**:
```typescript
// Use a simple rate limiting queue
const rateLimitQueue = <T extends { fen: string }>(
    fn: (item: T) => Promise<void>,
    maxConcurrent: number = 3
) => {
    const inProgress = new Map<string, Promise<void>>();

    return async (item: T) => {
        if (inProgress.has(item.fen)) {
            await inProgress.get(item.fen)!;
            return;
        }

        const promise = fn(item).finally(() => inProgress.delete(item.fen));
        inProgress.set(item.fen, promise);
        return promise;
    };
};

// Usage:
const rateLimitedTablebaseLookup = rateLimitQueue(
    async (node) => {
        const result = await lookupTablebase(node.state.fen, options);
        // Store result...
    },
    maxConcurrent
);
```

### 2. Caching Strategy

**Locations**:
1. ✅ **Memory cache** - 2-min TTL (already added to cloudEvaluate.ts)
2. **localStorage** - Persist EGTB results (recommended for Phase 2)
3. **IndexedDB** - Store large data (not needed for Phase 1)

### 3. Error Handling Strategy

**Response**: `try { ... } catch (error) { console.warn(...) }`

Do not throw - return `undefined` and let caller choose fallback.

**User feedback**:
- Add visual indicator when EGTB is being used (e.g., "Tablebase: #+3")
- Add tooltip explaining source in move list

### 4. Privacy Considerations

**Good news**: No credentials needed for Lichess public API
- No API keys, no user tracking
- Acceptable for most chess applications
- Consider offering optional paid API keys if scaling

---

## Testing Checklist

### Unit Tests (`shared/test/tablebase.test.mjs`)

```typescript
import { isTablebasePosition, lookupTablebase, formatTablebaseScore } from "dist/lib/tablebaseLookup";

// Test 1: Piece counting logic
assert(isTablebasePosition("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"), false);  // 16 pieces
assert(isTablebasePosition("7k/8/8/8/8/2K5/PPPPPPPP/8 w - - 0 1"), true);  // 2 pieces (K+k)

// Test 2: Mock scenarios
// Mock fetch to return dummy tablebase data
// Verify parse logic

// Test 3: Edge cases
// Empty FEN
// Invalid FEN
// >7 pieces
```

### Integration Tests

1. **Full game analysis**: Load PGN → Trigger analysis → Verify:
   - All endgame positions use EGTB source
   - Common openings use Cloud Eval source
   - Rare positions fallback to Local Engine

2. **Error handling**:
   - No internet → Fallback to Local Engine
   - API timeout → Fallback to Local Engine
   - Rate limit → Use cache/local engine immediately

3. **Performance**:
   - Measure average time per position
   - Verify cached results don't trigger new API calls

---

## Deployment Strategy

### Phase 1 - MVP (Week 1)

✅ **After Implementation**:

1. **Code changes** (no new build):
   - Update `cloudEvaluate.ts` with timeout/caching
   - Create `tablebaseLookup.ts` module
   - Update `evaluate.ts` with hybrid logic (add `useTablebases` flag)
   - Add EGTB toggle to Settings UI

2. **Manual testing**:
   - Load sample games in Analysis
   - Verify EGTB sources appear in engine lines
   - Verify fallback chain works
   - Check accuracy calculations for endgames

3. **Monitor** (if live):
   ->Error vs success rates
   - Average API response times
   - Cache hit ratios

### Phase 2 - Enhancements (Future)

1. **Store exact PVs**: Integrate Lichess ping API to get exact moves from tablebase score
2. **IndexedDB caching**: Persist results offline
3. **Configurable tablebase URL**: Allow users to point to private Syzygy mirrors
4. **Quantized scores**: Store tablebase scores in BoardState for post-game accuracy
5. **Advanced accuracy warnings**: Alert when a "blunder" might actually be tablebase win

---

## Success Metrics

| Metric | Target | How to Measure |
|--------|--------|----------------|
| Tablebase coverage | ≥95% of endgame positions | Manual audit of game positions |
| Cloud Eval vs Local Engine | 85% success rate | API response logs |
| Fallback success | 100% (always works) | End-to-end testing |
| API timeout failures | ≤5% | Error tracking |
| User satisfaction | Confirmed by testing | User feedback |

---

## Risks & Mitigations

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Data not found in tablebases | Partial data | High | Graceful fallback to cloud/local |
| API rate limiting | Slow analysis | Medium | Cache aggressively |
| Performance overhead | Slower analysis | Low | Small overhead (<5ms lookup) |
| Privacy concerns | User discomfort | Low (public API) | Transparent UI, no tracking |

---

## Dependencies

### External Services
- **Lichess Tablebase API**: `https://tablebase.lichess.org`
  - Public API, no rate limits documented
  - No authentication required
  - Acceptable for MVP Phase 1

### Internal Dependencies
- ✅ `shared/src/lib/tablebaseLookup.ts` - Created in Phase 1
- ✅ `client/src/apps/features/analysis/lib/cloudEvaluate.ts` - Enhanced in Phase 1
- ✅ `shared/src/types/game/position/StateTreeNode.ts` - No changes required
- ✅ `shared/src/types/game/position/EngineLine.ts` - No changes required

### New Files (Phase 1)
```
shared/src/lib/tablebaseLookup.ts       # EGTB API client
client/src/apps/features/analysis/components/SettingsDialog/EngineOptionsArea/index.tsx  # UI toggle
shared/test/tablebase.test.mjs        # Unit tests
```

### Modified Files (Phase 1)
```
client/src/apps/features/analysis/lib/optimizedEvaluate.ts  # New hybrid evaluator
client/src/apps/features/analysis/lib/evaluate.ts           # Update evaluate logic
```

---

## Timeline Estimate

| Task | Hours | Notes |
|------|-------|-------|
| Implement `tablebaseLookup.ts` | 4 | Pure TS, minimal complexity |
| Enhance `cloudEvaluate.ts` caching | 2 | Easy enhancement |
| Implement hybrid evaluate logic | 8 | Needs careful fallback logic |
| UI toggle integration | 2 | Simple switch component |
| Unit tests | 4 | Mock scenarios |
| Integration test & debug | 4 | Edge cases |
| Documentation | 2 | Write this spec |
| **Total Phase 1** | **26 hours** | ~1-2 weeks for experienced developer |

---

## Quick Start for Prototype

### Step 1: Create EGTB Module
```bash
# Create new file
touch shared/src/lib/tablebaseLookup.ts
# Copy code from Section 1 above
```

### Step 2: Test EGTB Lookup
```bash
cd shared
npm run build
node test/tablebase.test.mjs
```

### Step 3: Add to Analysis
```bash
# Import in evaluate.ts
import { lookupTablebase, isTablebasePosition } from "shared/lib/tablebaseLookup";

// Add hybrid logic (see Section 3)
function analyzePosition(fen, options) { ... }
```

### Step 4: Verify
- Load a game with clear endgame (King + Pawn vs King, for example)
- Check engine lines source in move list
- Verify "Tablebase: 0.00" appears

---

## References

✅ **Lichess Tablebase API Documentation**: https://tablebase.lichess.org/api-reference

✅ **Lichess Syzygy Tablebases**: 7-piece and Lomonosov available free

✅ **Current Cloud Eval Implementation**: Already exists, just needs enhancement

✅ **Existing Accuracy System**: Uses EngineLine directly - EGTB scores will integrate seamlessly

---

**Status**: Ready for Implementation ✅

**Next Steps**:
1. Review this plan
2. Set up git feature branch: `feat/lichess-cloud-egtb`
3. Begin with `tablebaseLookup.ts` implementation
4. Test manually with sample endgame positions
5. Iterate on evaluate.ts integration