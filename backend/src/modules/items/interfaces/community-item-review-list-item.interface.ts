/** 21.5e — položka pending fronty „předměty ke schválení" (Zpracovat tab). */
export interface CommunityItemReviewListItem {
  itemId: string;
  name: string;
  aliases?: string;
  /** Druh předmětu (zbraň/zbroj/…). */
  kind: string;
  /** Primární systém předmětu. */
  systemId: string;
  authorId: string;
  submittedAt: string;
}
