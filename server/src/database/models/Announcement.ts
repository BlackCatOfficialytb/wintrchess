import Collection from "@/constants/Collection";
import { model } from "@/database/model";

export interface AnnouncementDocument {
    colour: string;
    content: string;
}

const Announcement = model<AnnouncementDocument>(
    Collection.ANNOUNCEMENT
);

export default Announcement;
