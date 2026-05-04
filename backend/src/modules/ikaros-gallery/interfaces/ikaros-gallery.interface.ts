export type GalleryStatus = 'Draft' | 'Pending' | 'Published' | 'Rejected';

export interface GalleryRating {
  userId: string;
  stars: number;
}

export interface IkarosGalleryItem {
  id: string;
  title: string;
  description?: string;
  imageUrl: string;
  authorId: string;
  authorName: string;
  status: GalleryStatus;
  rejectReason?: string;
  ratings: GalleryRating[];
  averageRating: number;
  createdAtUtc: Date;
  updatedAtUtc: Date;
  publishedAtUtc?: Date;
}
