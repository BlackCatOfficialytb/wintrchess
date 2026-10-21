import { ArchivedGame as ArchivedGameDocument } from "shared/types/game/ArchivedGame";
import Collection from "@/constants/Collection";
import { model } from "@/database/model";

const ArchivedGame = model<ArchivedGameDocument>(
    Collection.ARCHIVED_GAMES
);

export default ArchivedGame;
