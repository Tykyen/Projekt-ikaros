export type GalleryStatus = 'Draft' | 'Pending' | 'Published' | 'Rejected';

/**
 * Spec 20D (D1) — dobrovolný self-declare původu obrázku. `none` = klasické
 * dílo, `ai_image` = autor uvedl, že obrázek vytvořila AI. Rozšiřitelný enum
 * (další zdroje přibudou s Fází 18); FE ho čte first-class pro AiBadge.
 */
export type GalleryAiOrigin = 'none' | 'ai_image';

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
  /** D-19.2 — velikost blobu v bytech; staré dokumenty pole nemají. */
  bytes?: number;
  category: string;
  authorId: string;
  authorName: string;
  /** D-040 — tombstone overlay pro galerie autora, který byl anonymizován. */
  authorIsDeleted?: boolean;
  status: GalleryStatus;
  rejectReason?: string;
  ratings: GalleryRating[];
  averageRating: number;
  /**
   * Spec 20D (D1) — self-declared původ obrázku. Default `none`. `ai_image`
   * zapne AiBadge napříč FE (detail, thumbnail).
   */
  aiOrigin: GalleryAiOrigin;
  createdAtUtc: Date;
  updatedAtUtc: Date;
  publishedAtUtc?: Date;
  /**
   * B4b (spec 20B) — true = obrázek skryt moderací (akce M2/M3). Veřejné read
   * cesty ho vynechají; vidí ho jen reviewer set.
   */
  moderationHidden?: boolean;
  moderationHiddenReason?: string;
}
