import React from "react";

import { getGameAccuracy } from "shared/lib/reporter/accuracy";
import useAnalysisGameStore from "@analysis/stores/AnalysisGameStore";
import useAnalysisBoardStore from "@analysis/stores/AnalysisBoardStore";
import AccuraciesCard from "@analysis/components/report/AccuraciesCard";
import ClassificationCountCard from "@analysis/components/report/ClassificationCountCard";
import TablebaseEvaluationWidget from "@analysis/components/report/TablebaseEvaluationWidget";

import EvaluationGraphArea from "./EvaluationGraphArea";

function GameReport() {
    const analysisGame = useAnalysisGameStore(state => state.analysisGame);

    useAnalysisBoardStore(state => state.currentStateTreeNodeUpdate);

    const accuracies = getGameAccuracy(analysisGame.stateTree);

    return <>
        <EvaluationGraphArea/>

        {/* Tablebase Evaluation - Shows endgame analysis */}
        <div className="mb-4" style={{ backgroundColor: 'var(--ui-shade-3)', padding: '12px', borderRadius: '8px', border: '1px solid var(--ui-shade-6)' }}>
            <h4 className="font-bold mb-3 text-white" style={{ fontSize: '16px' }}>
                Tablebase Analysis
            </h4>
            {/* Demo: Mock tablebase data for testing */}
            <TablebaseEvaluationWidget
                pvMoves={[
                    { move: "Re6", dtz: 1, isBest: true },
                    { move: "Kc5", dtz: 3 },
                    { move: "Rf1", dtz: 5 },
                ]}
                resultText="WHITE WINS BY ONE MOVE"
                defaultExpanded={true}
            />
        </div>

        <AccuraciesCard accuracies={accuracies} />

        <ClassificationCountCard analysisGame={analysisGame} />
    </>;