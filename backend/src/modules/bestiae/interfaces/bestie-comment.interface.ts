/**
 * 16.2b-2 — komentář komunitního bestiáře (FE+BE shared shape).
 * Dvouúrovňová diskuse: `targetType='beast'` (o bytosti/lore) vs
 * `targetType='statblock'` (ke statům systému `systemId`).
 */
export interface BestieComment {
  id: string;
  bestieId: string;
  targetType: 'beast' | 'statblock';
  /** Jen pro targetType='statblock'. */
  systemId?: string;
  authorId: string;
  authorName: string;
  content: string;
  moderationHidden?: boolean;
  moderationHiddenReason?: string;
  createdAt: Date;
  updatedAt: Date;
}
