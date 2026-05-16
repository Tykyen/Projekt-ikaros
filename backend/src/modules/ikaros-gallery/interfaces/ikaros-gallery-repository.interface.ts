import type {
  IkarosGalleryItem,
  GalleryStatus,
  GalleryRating,
} from './ikaros-gallery.interface';

export interface IIkarosGalleryRepository {
  findPublished(): Promise<IkarosGalleryItem[]>;
  findPublishedAndPending(): Promise<IkarosGalleryItem[]>;
  findPending(): Promise<IkarosGalleryItem[]>;
  findByAuthor(authorId: string): Promise<IkarosGalleryItem[]>;
  /** 3.7 — obrázky dle seznamu id (oblíbené). Vrací jen existující. */
  findByIds(ids: string[]): Promise<IkarosGalleryItem[]>;
  findById(id: string): Promise<IkarosGalleryItem | null>;
  create(data: Omit<IkarosGalleryItem, 'id'>): Promise<IkarosGalleryItem>;
  update(
    id: string,
    data: Partial<IkarosGalleryItem>,
  ): Promise<IkarosGalleryItem | null>;
  upsertRating(
    id: string,
    rating: GalleryRating,
  ): Promise<IkarosGalleryItem | null>;
  delete(id: string): Promise<boolean>;
  countByAuthorAndStatus(
    authorId: string,
  ): Promise<Record<GalleryStatus, number>>;
  countByCategory(category: string): Promise<number>;
  countPending(): Promise<number>;
  findPendingPaginated(
    offset: number,
    limit: number,
  ): Promise<IkarosGalleryItem[]>;
}
