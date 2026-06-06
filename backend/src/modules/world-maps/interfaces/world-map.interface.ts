/**
 * 13.4 — Mapy (obrázkový atlas světa). Jeden doc per svět drží pole map.
 * Každá mapa = nahraný obrázek + popis + per-mapa viditelnost (vzor: universe).
 */

export interface WorldMapEntry {
  id: string;
  title: string;
  description: string;
  imageUrl: string;
  order: number;
  isPublic: boolean;
  /** userIds hráčů, kteří mapu vidí (ignoruje se když `isPublic`). PJ-only. */
  visibleToPlayerIds: string[];
  createdAt: string;
  updatedAt: string;
}
