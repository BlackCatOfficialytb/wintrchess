import Collection from "@/constants/Collection";
import { model } from "@/database/model";

export interface InternalSessionDocument {
    token: string;
    createdAt: Date;
}

const InternalSession = model<InternalSessionDocument>(
    Collection.INTERNAL_SESSIONS
);

export default InternalSession;
