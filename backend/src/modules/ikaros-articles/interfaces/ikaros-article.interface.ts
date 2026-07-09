export type ArticleStatus = 'Draft' | 'Pending' | 'Published' | 'Rejected';

/**
 * 3.2a — kategorie je slug (např. 'povidky', 'poezie'). Validace proti DB
 * collection `article_categories.key` v `IkarosArticlesService`. Žádný
 * hardcoded enum — admin může přidávat kategorie přes
 * `/api/article-categories` CRUD.
 */
export type ArticleCategory = string;

export interface ArticleRating {
  userId: string;
  stars: number;
  /** 3.4f — denormalizované jméno recenzenta. */
  userName: string;
  /** 3.4f — volitelný recenzní text. */
  text: string;
  createdAtUtc: Date;
}

export interface IkarosArticle {
  id: string;
  title: string;
  content: string;
  category: ArticleCategory;
  authorId: string;
  authorName: string;
  /**
   * D-040 — true znamená že platformový účet autora byl anonymizován
   * (hard cleanup). FE rendruje tombstone + „Smazaný účet" místo authorName.
   * Default `false` (žít autor) nebo `undefined` (legacy bez enrich).
   */
  authorIsDeleted?: boolean;
  status: ArticleStatus;
  rejectReason?: string;
  ratings: ArticleRating[];
  averageRating: number;
  createdAtUtc: Date;
  updatedAtUtc: Date;
  publishedAtUtc?: Date;
  /**
   * B4b (spec 20B) — true = obsah skryt moderací (akce M2/M3). Veřejné read
   * cesty ho vynechají; vidí ho jen reviewer set. `moderationHiddenReason` je
   * interní poznámka (kód rozhodnutí), nezobrazuje se veřejně.
   */
  moderationHidden?: boolean;
  moderationHiddenReason?: string;
}
