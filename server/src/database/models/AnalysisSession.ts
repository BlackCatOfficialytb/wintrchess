import { Schema } from "mongoose";

import Collection from "@/constants/Collection";
import { model } from "@/database/model";

const analysisSessionSchema = new Schema({
    token: { type: String, required: true },
    actions: { type: Number, required: true },
    createdAt: { type: Date, required: true }
});

const AnalysisSession = model<{
    token: string;
    actions: number;
    createdAt: Date;
}>(
    "analysisSession",
    analysisSessionSchema,
    Collection.ANALYSIS_SESSIONS
);

export default AnalysisSession;
