/**
 * 21.5f — položka pending fronty „ceníky ke schválení" (Zpracovat tab).
 * Vzor: community-plant-review-list-item.interface.ts.
 */
export interface CommunityPriceListReviewListItem {
  priceListId: string;
  name: string;
  /** Počet položek ceníku (rychlá orientace kurátora). */
  itemCount: number;
  authorId: string;
  submittedAt: string;
}
