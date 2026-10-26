import { meanBy, sumBy, sortBy } from "lodash-es";

import { getNodeChain, StateTreeNode } from "@/types/game/position/StateTreeNode";
import Evaluation from "@/types/game/position/Evaluation";
import PieceColour from "@/constants/PieceColour";
import { getExpectedPointsLoss } from "./expectedPoints";

/**
 * Calculate standard deviation of an array of numbers
 */
function standardDeviation(values: number[]): number {
    if (values.length < 2) return 0;
    const mean = sumBy(values) / values.length;
    const variance = sumBy(values, v => Math.pow(v - mean, 2)) / (values.length - 1);
    return Math.sqrt(variance);
}

/**
 * Calculate volatility-weighted mean.
 * Penalizes inconsistent play (high standard deviation) by reducing the mean.
 * Formula: mean + penalty where penalty = -(std_dev / mean) * volatilityFactor
 */
function volatilityWeightedMean(accuracies: number[]): number {
    if (accuracies.length === 0) return 0;
    if (accuracies.length === 1) return accuracies[0];

    const mean = sumBy(accuracies) / accuracies.length;
    if (mean === 0) return 0;

    const stdDev = standardDeviation(accuracies);
    const volatilityFactor = 2.0; // Controls how strongly consistency is penalized

    // Penalty is more severe for higher volatility relative to the mean
    const penalty = -(stdDev / mean) * volatilityFactor;

    // Ensure penalty doesn't make the result negative
    let weighted = mean + penalty;
    return Math.max(0, weighted);
}

/**
 * Calculate harmonic mean of accuracies with safe handling of zeros.
 * Harmonic mean heavily penalizes single weak moves.
 */
function harmonicMean(accuracies: number[]): number {
    if (accuracies.length === 0) return 0;

    // Filter out zeros to avoid division by zero issues in pure harmonic mean
    const nonZeroAccuracies = accuracies.filter(a => a > 0);
    if (nonZeroAccuracies.length === 0) return 0;

    // Use pure harmonic mean formula: n / sum(1/x_i)
    const harmonicSum = sumBy(nonZeroAccuracies, a => 1 / a);

    // If we filtered out zeros, the harmonic mean might be higher than valid moves alone
    // Return at most the minimum accurate position count
    if (nonZeroAccuracies.length < accuracies.length) {
        // Return weighted harmonic mean: penalize for zero accuracies
        const validProportion = nonZeroAccuracies.length / accuracies.length;
        return (nonZeroAccuracies.length / harmonicSum) * validProportion;
    }

    return accuracies.length / harmonicSum;
}

/**
 * Calculate advanced accuracy metrics.
 *
 * @param accuracies - Array of move accuracies (0-100)
 * @returns Object containing:
 *   - combined: (volatilityWeightedMean + harmonicMean) / 2
 *   - volatilityWeighted: volatility-weighted mean
 *   - harmonic: harmonic mean
 *   - consistency: higher is more consistent (inverted standard deviation)
 */
function calculateAdvancedAccuracy(accuracies: number[]) {
    if (accuracies.length === 0) {
        return {
            combined: 0,
            volatilityWeighted: 0,
            harmonic: 0,
            consistency: 0
        };
    }

    const volatilityWeighted = volatilityWeightedMean(accuracies);
    const harmonic = harmonicMean(accuracies);
    const combined = (volatilityWeighted + harmonic) / 2;

    // Consistency metric: derived from standard deviation
    // Higher = more consistent (std dev closer to 0)
    const stdDev = standardDeviation(accuracies);
    // Normalize: max possible std dev for 0-100 range is 50, so ensure consistency is 0-100
    const maxPossibleStdDev = 50;
    let consistency = (maxPossibleStdDev - stdDev) / maxPossibleStdDev;
    consistency = Math.max(0, Math.min(100, consistency * 100));

    return {
        combined,
        volatilityWeighted,
        harmonic,
        consistency
    };
}

export function getGameAccuracy(rootNode: StateTreeNode) {
    const accuracyHolders = getNodeChain(rootNode).filter(
        node => node.state.accuracy != undefined
    );

    const whiteNodes = accuracyHolders.filter(
        node => node.state.moveColour == PieceColour.WHITE
    );

    const blackNodes = accuracyHolders.filter(
        node => node.state.moveColour == PieceColour.BLACK
    );

    const whiteAccuracies = whiteNodes.map(node => node.state.accuracy!);
    const blackAccuracies = blackNodes.map(node => node.state.accuracy!);

    // Use advanced accuracy calculation
    const whiteResult = calculateAdvancedAccuracy(whiteAccuracies);
    const blackResult = calculateAdvancedAccuracy(blackAccuracies);

    return {
        white: whiteResult.combined,
        black: blackResult.combined,
        // Include advanced metrics for debugging/analysis if needed
        whiteAdvanced: whiteResult,
        blackAdvanced: blackResult
    };
}

export function getMoveAccuracy(
    previousEvaluation: Evaluation,
    currentEvaluation: Evaluation,
    moveColour: PieceColour
) {
    const pointLoss = getExpectedPointsLoss(
        previousEvaluation,
        currentEvaluation,
        moveColour
    );

    return 103.16 * Math.exp(-4 * pointLoss) - 3.17;
}