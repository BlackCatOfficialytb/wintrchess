import { sum, round } from "lodash-es";

import AnalysedGame from "shared/types/game/AnalysedGame";
import EngineVersion from "shared/constants/EngineVersion";
import { StateTreeNode, getNodeChain } from "shared/types/game/position/StateTreeNode";
import { getTopEngineLine } from "shared/types/game/position/EngineLine";
import Engine from "@analysis/lib/engine";
import getCloudEvaluation from "./cloudEvaluate";
import { isTablebasePosition, lookupTablebase } from "shared/lib/tablebaseLookup";

interface EvaluateMovesOptions {
    engineVersion: EngineVersion;
    multiThreaded: boolean;
    maxEngineCount?: number;
    engineDepth: number;
    engineTimeLimit?: number;
    cloudEngineLines: number;
    useTablebases: boolean;
    tablebaseTries: number;
    engineConfig?: (engine: Engine) => void;
    onProgress?: (progress: number) => void;
    verbose?: boolean;
}

interface EvaluationProcess {
    evaluate: () => Promise<StateTreeNode[]>;
    controller: AbortController;
}

function createGameEvaluator(
    game: AnalysedGame,
    options: EvaluateMovesOptions
): EvaluationProcess {
    const controller = new AbortController();

    return {
        evaluate,
        controller
    };
}

async function evaluate(
    game: AnalysedGame,
    options: EvaluateMovesOptions
): Promise<StateTreeNode[]> {
    const stateTreeNodes = getNodeChain(game.stateTree).filter(node => !node.mainline);

    const progressInterval = 1000;
    const totalNodes = stateTreeNodes.length;
    let progresses: number[] = [];

    function getProgress() {
        return progresses.length / totalNodes * 100;
    }

    const statesProcessed = new Set<string>();

    function createGameEvaluator() {
        return {
            evaluate: async () => {
                return stateTreeNodes;
            },
            controller
        };
    }

    async function evaluator(): Promise<StateTreeNode[]> {
        // Apply cloud evaluations where possible
        for (const stateTreeNode of stateTreeNodes) {
            if (controller.signal.aborted) break;

            // Strategy 1: Try tablebase if enabled and position has ≤7 pieces
            if (options.useTablebases && isTablebasePosition(stateTreeNode.state.fen)) {
                let tablebaseResult;
                let tries = 0;
                const maxTries = options.tablebaseTries;

                while (tries < maxTries && (!tablebaseResult || !tablebaseResult.win && !tablebaseResult.draw && !tablebaseResult.loss)) {
                    tablebaseResult = await lookupTablebase(stateTreeNode.state.fen, {
                        multiPv: 6,
                        timeout: 300
                    });
                    tries++;
                    if (tries > 1) {
                        // Small delay between retries
                        await new Promise(resolve => setTimeout(resolve, 500));
                    }
                }

                if (tablebaseResult) {
                    // Calculate score for engine lines
                    let evaluation;
                    if (tablebaseResult.draw) {
                        evaluation = { type: "centipawn" as const, value: 0 };
                    } else if (tablebaseResult.win) {
                        evaluation = { type: "mate" as const, value: tablebaseResult.dtm || 100 };
                    } else if (tablebaseResult.loss) {
                        evaluation = { type: "mate" as const, value: -tablebaseResult.dtm || -100 };
                    } else {
                        // Convert centipawn score
                        evaluation = { type: "centipawn" as const, value: tablebaseResult.score };
                    }

                    // Create tablebase-based engine lines
                    stateTreeNode.state.engineLines.push({
                        evaluation,
                        source: EngineVersion.EGTB_SYZYGY,
                        depth: 1,
                        index: 1,
                        moves: []
                    });

                    progresses.push(1);
                    options.onProgress?.(getProgress());
                    continue;
                }
            }

            // Strategy 2: Try cloud evaluation for remaining positions
            try {
                var cloudEngineLines = await getCloudEvaluation(
                    stateTreeNode.state.fen, options.cloudEngineLines
                );
            } catch {
                // Continue to local engine fallback
            }

            const topCloudLine = getTopEngineLine(cloudEngineLines);
            if (!topCloudLine) continue;

            if (topCloudLine.depth < options.engineDepth) continue;
            if (cloudEngineLines.length < options.cloudEngineLines) continue;

            stateTreeNode.state.engineLines = [
                ...stateTreeNode.state.engineLines,
                ...cloudEngineLines
            ];

            progresses.push(1);
            options.onProgress?.(getProgress());
        }
    }

    const evaluationProcess = createGameEvaluator();

    await evaluationProcess.evaluate();

    return stateTreeNodes;
}

export { evaluate };