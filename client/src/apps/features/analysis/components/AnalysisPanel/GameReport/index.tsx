import React from "react";

import { getGameAccuracy } from "shared/lib/reporter/accuracy";
import useAnalysisGameStore from "@analysis/stores/AnalysisGameStore";
import useAnalysisBoardStore from "@analysis/stores/AnalysisBoardStore";
import AccuraciesCard from "@analysis/components/report/AccuraciesCard";
import ClassificationCountCard from "@analysis/components/report/ClassificationCountCard";

import EvaluationGraphArea from "./EvaluationGraphArea";

function GameReport() {
    const analysisGame = useAnalysisGameStore(state => state.analysisGame);

    useAnalysisBoardStore(state => state.currentStateTreeNodeUpdate);

    const accuracies = analysisGame
        ? getGameAccuracy(analysisGame.stateTree)
        : null;

    return (
        <div>
            <EvaluationGraphArea/>

            {accuracies && <AccuraciesCard accuracies={accuracies} />}
            {analysisGame && <ClassificationCountCard analysisGame={analysisGame} />}
        </div>
    );
}

export default GameReport;
