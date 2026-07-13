/**
 * 21.5c — komentář komunitního kouzla. Dvě úrovně přes `targetType`:
 * 'spell' = diskuse o kouzle / lore (napříč systémy), 'statblock' = diskuse
 * ke statbloku jednoho systému (balanc). Vzor: bestie-comment.
 */
export interface SpellComment {
  id: string;
  spellId: string;
  targetType: 'spell' | 'statblock';
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
