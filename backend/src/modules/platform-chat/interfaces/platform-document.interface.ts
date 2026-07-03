/** 20.5 — sdílený PDF dokument admin chatu (sklad). */
export interface PlatformDocument {
  id: string;
  filename: string;
  /** Cloudinary raw URL (přímé čtení/stažení). */
  url: string;
  publicId: string;
  mimeType: string;
  sizeBytes: number;
  uploaderId: string;
  uploaderName: string;
  createdAt: Date;
}
