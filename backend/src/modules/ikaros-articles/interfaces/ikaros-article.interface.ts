export type ArticleStatus = 'Draft' | 'Pending' | 'Published' | 'Rejected';
export type ArticleCategory =
  | 'Povidky'
  | 'Poezie'
  | 'Uvahy'
  | 'Recenze'
  | 'Postavy'
  | 'Ostatni';

export interface ArticleRating {
  userId: string;
  stars: number;
}

export interface IkarosArticle {
  id: string;
  title: string;
  content: string;
  category: ArticleCategory;
  authorId: string;
  authorName: string;
  status: ArticleStatus;
  rejectReason?: string;
  ratings: ArticleRating[];
  averageRating: number;
  createdAtUtc: Date;
  updatedAtUtc: Date;
  publishedAtUtc?: Date;
}
