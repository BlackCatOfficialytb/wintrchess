import { Schema } from "mongoose";

import Collection from "@/constants/Collection";
import { model } from "@/database/model";

const announcementSchema = new Schema({
    colour: { type: String, required: true },
    content: { type: String, required: true }
});

const Announcement = model<{
    colour: string;
    content: string;
}>(
    "announcement",
    announcementSchema,
    Collection.ANNOUNCEMENT
);

export default Announcement;
