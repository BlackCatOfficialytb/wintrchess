import { useShallow } from "zustand/react/shallow";
import { cloneDeep } from "lodash-es";

import {
    findNodeRecursively,
    getNodeChain
} from "shared/types/game/position/StateTreeNode";
import useAnalysisGameStore from "@analysis/stores/AnalysisGameStore";
import useAnalysisBoardStore from "@analysis/stores/AnalysisBoardStore";
import useAnalysisProgressStore from "@analysis/stores/AnalysisProgressStore";
import useRealtimeEngineStore from "@analysis/stores/RealtimeEngineStore";
import useEvaluateGame from "./useEvaluateGame";

// Re-runs engine evaluation & classification for the currently open game,
// using the current engine settings; used by the "reanalyze" toolbar button
// after changing those settings, instead of going back and re-analysing the
// game from Game Selection. Classification resumes automatically through the
// AWAITING_CAPTCHA flow in AnalysisProgress once evaluation completes.
function useReanalyzeGame() {
    const { analysisGame, setAnalysisGame } = useAnalysisGameStore();

    const setCurrentStateTreeNode = useAnalysisBoardStore(
        state => state.setCurrentStateTreeNode
    );

    const {
        setEvaluationController,
        setEvaluationProgress,
        setAnalysisError
    } = useAnalysisProgressStore(
        useShallow(state => ({
            setEvaluationController: state.setEvaluationController,
            setEvaluationProgress: state.setEvaluationProgress,
            setAnalysisError: state.setAnalysisError
        }))
    );

    const setDisplayedEngineLines = useRealtimeEngineStore(
        state => state.setDisplayedEngineLines
    );

    const evaluateGame = useEvaluateGame();

    return async function reanalyzeGame() {
        // Clear any progress/error left over from the previous run
        setAnalysisError();
        setEvaluationProgress(0);

        // Strip engine lines from every node so the evaluation starts from
        // scratch instead of appending to the previous (differently
        // configured) results
        const freshGame = cloneDeep(analysisGame);

        for (const node of getNodeChain(freshGame.stateTree, true)) {
            node.state.engineLines = [];
        }

        setAnalysisGame(freshGame);

        // Keep the board on the equivalent node of the fresh tree
        setCurrentStateTreeNode(prev => (
            findNodeRecursively(
                freshGame.stateTree,
                node => node.id == prev.id
            ) || freshGame.stateTree
        ));

        setDisplayedEngineLines([]);

        const controller = await evaluateGame(freshGame);
        setEvaluationController(controller);
    };
}

export default useReanalyzeGame;
