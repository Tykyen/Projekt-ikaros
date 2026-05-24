export interface ArticleVersion {
  id: string;
  articleId: string;
  revision: number;
  title: string;
  content: string;
  category: string;
  status: string;
  editedBy: string;
  editedByName: string;
  createdAt: Date;
}
