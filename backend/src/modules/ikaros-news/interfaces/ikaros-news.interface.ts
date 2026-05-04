export interface IkarosNewsItem {
  id: string;
  title: string;
  content: string;
  authorId: string;
  authorName: string;
  createdAtUtc: Date;
  isActive: boolean;
}
