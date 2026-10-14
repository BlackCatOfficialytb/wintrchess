import { Types, Schema } from "mongoose";

import { ArchivedGame } from "shared/types/game/ArchivedGame";
import Collection from "@/constants/Collection";
import { model } from "@/database/model";

type ArchivedGameDocument = (
    Omit<ArchivedGame, "userId">
    & { userId: Types.ObjectId }
);

const archivedGameSchema = new Schema<ArchivedGameDocument>(
    {}, { strict: false }
);

const ArchivedGame = model<ArchivedGameDocument>(
    "archivedGame",
    archivedGameSchema,
    Collection.ARCHIVED_GAMES
);

export default ArchivedGame;