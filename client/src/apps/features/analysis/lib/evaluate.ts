import { sum, round } from "lodash-es";

import AnalysedGame from "shared/types/game/AnalysedGame";
import EngineVersion from "shared/constants/EngineVersion";
import { StateTreeNode, getNodeChain } from "shared/types/game/position/StateTreeNode";
import { getTopEngineLine } from "shared/types/game/position/EngineLine";
import Engine from "@analysis/lib/engine";
import getCloudEvaluation from "./cloudEvaluate";
import { isTablebasePosition, lookupTablebase, getTablebaseMoveEvaluation, getTablebaseResultEvaluation } from "shared/lib/tablebaseLookup";
import { EngineLine } from "shared/types/game/position/EngineLine";

interface EvaluateMovesOptions {
    engineVersion: EngineVersion;
    multiThreaded: boolean;
    maxEngineCount?: number;
    engineDepth: number;
    engineTimeLimit?: number;
    cloudEngineLines: number;
    useTablebases?: boolean;
    tablebaseTries?: number;
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

    // Strategy 1: tablebase lookup for positions with <= 7 pieces.
    // Returns engine lines derived from the tablebase result, or
    // undefined when the position is ineligible / lookup failed.
    async function getTablebaseLines(
        fen: string
    ): Promise<EngineLine[] | undefined> {
        if (!options.useTablebases || !isTablebasePosition(fen)) return undefined;

        const tries = options.tablebaseTries || 1;

        for (let attempt = 0; attempt < tries; attempt++) {
            const result = await lookupTablebase(fen);

            if (!result) continue;

            const tablebaseLines = result.moves
                .slice(0, Math.max(options.cloudEngineLines, 1))
                .map((move, offset): EngineLine => ({
                    evaluation: getTablebaseMoveEvaluation(move, fen),
                    source: EngineVersion.EGTB_SYZYGY,
                    depth: 1,
                    index: offset + 1,
                    moves: [{ san: move.san, uci: move.uci }]
                }));

            // Checkmate/stalemate positions have no legal moves
            if (!tablebaseLines.length) {
                tablebaseLines.push({
                    evaluation: getTablebaseResultEvaluation(result, fen),
                    source: EngineVersion.EGTB_SYZYGY,
                    depth: 1,
                    index: 1,
                    moves: []
                });
            }

            return tablebaseLines;
        }

        return undefined;
    }

    async function evaluator(): Promise<StateTreeNode[]> {
        // Apply tablebases and cloud evaluations where possible
        for (const stateTreeNode of stateTreeNodes) {
            if (controller.signal.aborted) break;

            const tablebaseLines = await getTablebaseLines(stateTreeNode.state.fen);

            if (tablebaseLines) {
                stateTreeNode.state.engineLines = [
                    ...stateTreeNode.state.engineLines,
                    ...tablebaseLines
                ];

                progresses.push(1);
                options.onProgress?.(getProgress());
                continue;
            }

            try {
                var cloudEngineLines = await getCloudEvaluation(
                    stateTreeNode.state.fen, options.cloudEngineLines
                );
            } catch {
                break;
            }

            const topCloudLine = getTopEngineLine(cloudEngineLines);
            if (!topCloudLine) break;

            if (topCloudLine.depth < options.engineDepth) break;
            if (cloudEngineLines.length < options.cloudEngineLines) break;

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
                    || line.source == EngineVersion.EGTB_SYZYGY
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
