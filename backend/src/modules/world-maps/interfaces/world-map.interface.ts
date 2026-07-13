/**
 * 13.4 — Mapy (obrázkový atlas světa). Jeden doc per svět drží pole map.
 * Každá mapa = nahraný obrázek + popis + per-mapa viditelnost (vzor: universe).
 */

/** 16.5 — cíl vlaječky po kliknutí. */
export type WorldMapPinTargetType = 'page' | 'map' | 'none';

/**
 * 16.5 — vlaječka (pin) nad obrázkem mapy. `x/y` v 0..1. Vzhled (`icon`/`color`)
 * volí PJ; `targetType` nese roli. Viditelnost per pin jako u mapy (tajné
 * vlaječky; leak-safe strip pro ne-oprávněné).
 */
export interface WorldMapPin {
  id: string;
  x: number;
  y: number;
  label: string;
  info: string;
  targetType: WorldMapPinTargetType;
  targetSlug: string | null;
  targetMapId: string | null;
  icon: string;
  color: string;
  isPublic: boolean;
  visibleToPlayerIds: string[];
}

export interface WorldMapEntry {
  id: string;
  /** Vnořená složka (13.4b, F2). `null` = kořen atlasu. */
  folderId: string | null;
  title: string;
  description: string;
  imageUrl: string;
  /** D-19.2 — velikost blobu `imageUrl` v bytech; staré dokumenty nemají. */
  imageBytes?: number;
  order: number;
  isPublic: boolean;
  /** userIds hráčů, kteří mapu vidí (ignoruje se když `isPublic`). PJ-only. */
  visibleToPlayerIds: string[];
  /** 16.5 — klikací vlaječky nad obrázkem. */
  pins: WorldMapPin[];
  /** 16.5b — id propojené taktické scény (1:1); `null` = nepropojeno. */
  linkedSceneId: string | null;
  createdAt: string;
  updatedAt: string;
}
