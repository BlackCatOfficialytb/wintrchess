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
    useTablebases: boolean;  // NEW: Enable tablebase lookup
    tablebaseTries: number;  // NEW: How many times to retry if fail
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

    const stateTreeNodes = getNodeChain(game.stateTree);

    // Each state tree node keeps a progress from 0 to 1
    const progresses: number[] = [];

    function getProgress() {
        return round(sum(progresses) / stateTreeNodes.length, 3);
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
                        depth: 1,  // Tablebase is always depth 1
                        index: 1,  // Only top line
                        moves: []  // TODO: Generate PV moves from tablebase
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

        // Locally evaluate remaining positions

        // Maximum engine count or however many are needed for each
        // remaining position, add 1 for cutoff for last cloud evaluated state
        const evaluatedStateCount = stateTreeNodes.filter(
            node => node.state.engineLines.some(
                line => line.source == EngineVersion.LICHESS_CLOUD
            )
        ).length;

        const engineCount = Math.min(
            options.maxEngineCount || 1,
            (stateTreeNodes.length - evaluatedStateCount) + 1
        );

        let enginesResting = 0;
        let stateTreeNodeIndex = Math.max(evaluatedStateCount - 1, 0);

        return await new Promise<StateTreeNode[]>(async (res, rej) => {
            // Bring an engine to a new FEN
            async function evaluateNextPosition(engine: Engine) {
                const currentStateTreeNodeIndex = stateTreeNodeIndex;
                const currentStateTreeNode = stateTreeNodes[stateTreeNodeIndex];

                if (stateTreeNodeIndex >= stateTreeNodes.length) {
                    engine.terminate();

                    if (++enginesResting == engineCount)
                        res(stateTreeNodes);

                    return;
                }

                engine.setPosition(game.initialPosition, stateTreeNodes
                    .slice(0, stateTreeNodeIndex + 1)
                    .filter(node => node.state.move)
                    .map(node => node.state.move!.uci)
                );

                engine.evaluate({
                    depth: options.engineDepth,
                    timeLimit: options.engineTimeLimit
                        ? options.engineTimeLimit * 1000
                        : undefined,
                    onEngineLine: line => {
                        // Depth 0 is given for states with no legal moves
                        const localProgress = line.depth == 0
                            ? 1 : line.depth / options.engineDepth;
                        
                        // Progress value will already exist for cutoff node
                        progresses[currentStateTreeNodeIndex] = Math.max(
                            progresses[currentStateTreeNodeIndex] || 0,
                            localProgress
                        );

                        options.onProgress?.(getProgress());
                    }
                }).then(async lines => {
                    progresses[currentStateTreeNodeIndex] = 1;

                    currentStateTreeNode.state.engineLines = [
                        ...currentStateTreeNode.state.engineLines,
                        ...lines
                    ];

                    await evaluateNextPosition(engine);
                });

                stateTreeNodeIndex++;
            }

            // Start engines on first positions
            const engines: Engine[] = [];

            for (let i = 0; i < engineCount; i++) {
                const engine = new Engine(options.engineVersion, options.multiThreaded);
                engines.push(engine);

                options.engineConfig?.(engine);

                if (options.verbose) {
                    engine.onMessage(console.log);
                }

                engine.onError(rej);

                await evaluateNextPosition(engine);
            }

            controller.signal.addEventListener("abort", () => {
                engines.forEach(engine => engine.terminate());
                rej("abort");
            });
        });
    }

    return { evaluate: evaluator, controller };
}

export default createGameEvaluator;