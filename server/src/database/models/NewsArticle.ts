import NewsArticleData from "shared/types/NewsArticle";
import Collection from "@/constants/Collection";
import { model } from "@/database/model";

const NewsArticle = model<NewsArticleData>(
    Collection.NEWS_ARTICLES
);

export default NewsArticle;
