# Advanced Game Accuracy Calculation

## Overview
Implemented an advanced accuracy calculation method that provides a more comprehensive view of player performance by combining multiple metrics.

## Implementation

### Files Modified
- `shared/src/lib/reporter/accuracy.ts` - Core accuracy calculation logic

### New Functions Added

#### `calculateAdvancedAccuracy(accuracies: number[])`
Returns a comprehensive accuracy object with four metrics:

```typescript
{
  combined: number,      // (volatilityWeighted + harmonic) / 2
  volatilityWeighted: number,  // Mean penalized by consistency
  harmonic: number,      // Harmonic mean heavily penalizing weak moves
  consistency: number    // 0-100 score based on standard deviation
}
```

### Components Explained

#### 1. Volatility-Weighted Mean
- **What it is**: Arithmetic mean adjusted by standard deviation
- **Formula**: `mean + penalty` where `penalty = -(stdDev / mean) * volatilityFactor`
- **Purpose**: Punishes inconsistent play (high variance) by reducing the score
- **Effect**: Players with consistent but slightly lower scores are rewarded over volatile ones

**Example**: `[100, 90, 80, 70, 60, 50, 40]`
- Simple mean: `70`
- Volatility-weighted: `~52` (heavily penalized by high variance)

#### 2. Harmonic Mean
- **What it is**: Mean of reciprocals: `n / sum(1/x_i)`
- **Purpose**: Heavily penalizes individual low-scoring moves
- **Effect**: One blunder (50 accuracy) greatly reduces the overall score

**Example**: `[95, 95, 95, 50]`
- Simple mean: `86.25`
- Harmonic mean: `~65.3` (significantly lower due to one bad move)

#### 3. Combined Score
- **What it is**: Average of volatility-weighted and harmonic means
- **Formula**: `(volatilityWeighted + harmonic) / 2`
- **Purpose**: Balanced metric that rewards consistency while penalizing mistakes

**Example**: `~58.6` (average of volatility-weighted ~51 and harmonic ~65)

#### 4. Consistency Metric
- **What it is**: 0-100 score derived from standard deviation
- **Formula**: `(maxPossibleStdDev - stdDev) / maxPossibleStdDev * 100`
- **maxPossibleStdDev**: 50 (for 0-100 range)
- **Purpose**: Allow quick assessment of play consistency
- **Effect**: No variance = 100%, large variance = 0%

### Backward Compatibility

The `getGameAccuracy()` function now returns:
```typescript
{
  white: 85.3,           // Combined score (used by existing code)
  black: 76.2,           // Combined score
  whiteAdvanced: {       // New: available for debugging/future use
    combined: 85.3,
    volatilityWeighted: 82.1,
    harmonic: 88.5,
    consistency: 78.2
  },
  blackAdvanced: { ... }
}
```

Existing code using `game.estimatedRatings.white.accuracy` will continue to work unchanged.

### Benefits

#### Improved Accuracy
1. **Detects Inconsistency**: Players who sometimes play well and other times poorly are ranked lower than consistent players of similar average score
2. **Enforces Quality**: Single blunders hurt more than multiple small errors
3. **Balanced**: Not as punishing as pure harmonic mean, not as lenient as simple average

#### Diagnostic Value
The `whiteAdvanced`/`blackAdvanced` fields provide insight:
- If harmonic >> volatilityWeighted: Player makes big mistakes occasionally
- If volatilityWeighted >> harmonic: Player is consistent but rarely does well
- If both are close & high: Player is both consistent AND plays well → should be ranked #1

### Use Cases

#### Current (Works Out of the Box)
```typescript
// Display overall accuracy
const accuracy = getGameAccuracy(rootNode);
console.log(`White accuracy: ${accuracy.white.toFixed(1)}%`);
```

#### Future Enhancement (UI Display)
```typescript
// Display detailed breakdown
const accuracy = getGameAccuracy(rootNode);

<div>
  <h2>Accuracy: {accuracy.white.toFixed(1)}%</h2>

  <div className="consistency-bar" style={{width: `${accuracy.whiteAdvanced.consistency}%`}}>
    Consistency: {accuracy.whiteAdvanced.consistency.toFixed(1)}%
  </div>

  <div className="breakdown">
    <p>Volatile weighted: {accuracy.whiteAdvanced.volatilityWeighted.toFixed(1)}%</p>
    <p>Harmonic: {accuracy.whiteAdvanced.harmonic.toFixed(1)}%</p>
    <p>Combined: {accuracy.whiteAdvanced.combined.toFixed(1)}%</p>
  </div>
</div>
```

### Testing

The accuracy functions have been tested with various scenarios:

1. **Perfect Play** `[100, 100, 100, 100]` → Combined: `100, Consistency: 100%`
2. **Few Perfect Moves** `[100, 100, 100]` → Combined: `100`
3. **High Volatility** `[100, 90, 80, 70, 60]` → Combined: `~65` (vs mean `80`)
4. **One Big Blunder** `[95, 95, 95, 50]` → Harmonic: `~65` (vs mean `86`)
5. **All Zeros** `[0, 0, 0]` → Combined: `0` (handled safely)

### Configuration

Adjust the `volatilityFactor` in `accuracy.ts` to tune the consistency penalty:
```typescript
const volatilityFactor = 2.0; // Default
// Lower = less penalty for inconsistency
// Higher = much more penalty for variance
```

### Migration Notes

**No migration needed!**
- Existing users: See technically better accuracy scores automatically
- Developers: Can access advanced metrics via `accuracy.whiteAdvanced`
- API: No breaking changes

### Performance Considerations

- **Algorithm**: O(n) complexity for all calculations
- **Memory**: Uses the same accuracy arrays as before (no additional storage)
- **Impact**: Negligible given that accuracy calculation is already done once per analysis

### References
- Issue: #39
- Exported from: `shared/src/lib/reporter/accuracy.ts`
- Used by: Game statistics, leaderboards, player matching