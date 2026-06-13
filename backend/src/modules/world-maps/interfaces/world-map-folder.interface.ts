/**
 * 13.4b F2 — Složka atlasu map. Vnořený strom přes `parentId` (`null` = kořen).
 * Viditelnost kaskáduje: hráč vidí složku jen když vidí i celou cestu k ní.
 */
export interface WorldMapFolder {
  id: string;
  /** Rodičovská složka; `null` = kořen atlasu. */
  parentId: string | null;
  name: string;
  order: number;
  isPublic: boolean;
  /** userIds hráčů, kteří složku vidí (ignoruje se když `isPublic`). PJ-only. */
  visibleToPlayerIds: string[];
  createdAt: string;
  updatedAt: string;
}
