export interface ChatGroup {
  id: string;
  worldId: string;
  name: string;
  order: number;
  /** Obrázek kanálu (Cloudinary URL). */
  imageUrl?: string;
  /** Krok 6.5c — PJ explicit volba barvy, slot `'0'..'11'`; `undefined` = auto (hash). */
  color?: string;
  /** Krok 6.5c — PJ ikona, klíč z FE mapy `GROUP_ICONS`; `undefined` = bez ikony. */
  iconKey?: string;
  /** Krok 6.1g — světová družina, pro kterou byl kanál auto-založen. */
  linkedWorldGroup?: string;
  createdAt: Date;
}
