export type GalleryStatus = 'Draft' | 'Pending' | 'Published' | 'Rejected';

export interface GalleryRating {
  userId: string;
  stars: number;
  /** 3.4f — denormalizované jméno recenzenta. */
  userName: string;
  /** 3.4f — volitelný recenzní text. */
  text: string;
  createdAtUtc: Date;
}

export interface IkarosGalleryItem {
  id: string;
  title: string;
  description?: string;
  imageUrl: string;
  publicId: string;
  width: number;
  height: number;
  category: string;
  authorId: string;
  authorName: string;
  /** D-040 — tombstone overlay pro galerie autora, který byl anonymizován. */
  authorIsDeleted?: boolean;
  status: GalleryStatus;
  rejectReason?: string;
  ratings: GalleryRating[];
  averageRating: number;
  createdAtUtc: Date;
  updatedAtUtc: Date;
  publishedAtUtc?: Date;
}
