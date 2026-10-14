import { Schema } from "mongoose";

import Collection from "@/constants/Collection";
import { model } from "@/database/model";

const internalSessionSchema = new Schema({
    token: { type: String, required: true },
    createdAt: { type: Date, required: true }
});

const InternalSession = model<{
    token: string;
    createdAt: Date;
}>(
    "internalSession",
    internalSessionSchema,
    Collection.INTERNAL_SESSIONS
);

export default InternalSession;
