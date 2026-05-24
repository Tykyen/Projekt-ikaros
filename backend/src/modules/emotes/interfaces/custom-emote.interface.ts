export interface CustomEmote {
  id: string;
  worldId: string | null;
  name: string;
  shortcode: string;
  /** Cloudinary publicId — backend storage reference. */
  imageId: string;
  /** Krok 6.4 — plná URL obrázku (FE render bez znalosti cloud_name). */
  imageUrl: string;
  createdBy: string;
  /** D-NEW-emote-categories — volné tagy (string list) pro filtraci v admin gridu. */
  tags: string[];
  createdAt: Date;
}
