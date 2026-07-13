/**
 * 21.5e — komentář komunitního předmětu. Dvě úrovně přes `targetType`:
 * 'item' = diskuse o předmětu / lore, 'statblock' = ke statům jednoho
 * systému (balanc). Vzor: spell-comment (21.5c).
 */
export interface ItemComment {
  id: string;
  itemId: string;
  targetType: 'item' | 'statblock';
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
