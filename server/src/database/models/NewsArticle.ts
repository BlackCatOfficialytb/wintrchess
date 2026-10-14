import { Schema } from "mongoose";

import NewsArticle from "shared/types/NewsArticle";
import Collection from "@/constants/Collection";
import { model } from "@/database/model";

const newsArticleSchema = new Schema<NewsArticle>({
    id: { type: String, required: true },
    title: { type: String, required: true },
    thumbnail: { type: String },
    tag: {
        name: { type: String, required: true },
        colour: { type: String, required: true }
    },
    timestamp: { type: String, required: true },
    content: { type: String, required: true }
});

const NewsArticle = model<NewsArticle>(
    "newsArticle",
    newsArticleSchema,
    Collection.NEWS_ARTICLES
);

export default NewsArticle;