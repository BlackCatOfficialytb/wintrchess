import Collection from "@/constants/Collection";
import { model } from "@/database/model";

export interface AnalysisSessionDocument {
    token: string;
    actions: number;
    createdAt: Date;
}

const AnalysisSession = model<AnalysisSessionDocument>(
    Collection.ANALYSIS_SESSIONS
);

export default AnalysisSession;
