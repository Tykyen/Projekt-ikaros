/**
 * Spec 3.3b — payload jedné karty v Zpracovat tabu pro queue typ
 * `gallery_pending_review`. FE renderer z toho staví Left/Mid/Actions.
 */
export interface GalleryReviewListItem {
  imageId: string;
  title: string;
  /** Cloudinary URL obrázku — FE z ní udělá thumbnail. */
  imageUrl: string;
  category: string;
  authorId: string;
  authorName: string;
  /** ISO timestamp odeslání ke schválení (`updatedAtUtc` v Pending statusu). */
  submittedAt: string;
}
