import React from "react";

import useAnalysisBoardStore from "@analysis/stores/AnalysisBoardStore";
import useAnalysisGameStore from "@analysis/stores/AnalysisGameStore";
import TablebasePositionCard from "@analysis/components/analysis/TablebasePositionCard";
import StateTreeEditor from "@/components/chess/StateTreeEditor";
import playBoardSound from "@/lib/boardSounds";

import * as styles from "./GameAnalysis.module.css";

function GameAnalysis() {
    const { analysisGame } = useAnalysisGameStore();

    const {
        currentStateTreeNode,
        setCurrentStateTreeNode,
        setAutoplayEnabled
    } = useAnalysisBoardStore();

    return <React.Fragment>
        <TablebasePositionCard/>

        <StateTreeEditor
            className={styles.stateTreeEditor}
            stateTreeRootNode={analysisGame.stateTree}
            onMoveClick={node => {
                setCurrentStateTreeNode(node);

                if (node != currentStateTreeNode) {
                    playBoardSound(node);
                }

                setAutoplayEnabled(false);
            }}
        />
    </React.Fragment>;
}

export default GameAnalysis;