/**
 * 10.2d-prep-B — Bestie entity rozhraní (FE+BE shared shape).
 */
export interface Bestie {
  id: string;
  scope: 'system' | 'user' | 'world';
  systemId: string;
  ownerUserId?: string;
  worldId?: string;
  name: string;
  imageUrl?: string;
  notes: string;
  abilities: Array<{ label: string; value: string }>;
  systemStats: Record<string, unknown>;
  clonedFromId?: string;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
