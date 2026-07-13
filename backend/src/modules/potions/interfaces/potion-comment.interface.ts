/**
 * 21.5b — komentář komunitního lektvaru. Dvě úrovně přes `targetType`:
 * 'potion' = diskuse o lektvaru / lore, 'statblock' = ke statům jednoho
 * systému (balanc). Vzor: spell-comment (21.5c).
 */
export interface PotionComment {
  id: string;
  potionId: string;
  targetType: 'potion' | 'statblock';
  /** Jen pro targetType='statblock' — ke které pravidlové verzi patří. */
  systemId?: string;
  authorId: string;
  authorName: string;
  content: string;
  moderationHidden?: boolean;
  moderationHiddenReason?: string;
  createdAt: Date;
  updatedAt: Date;
}
