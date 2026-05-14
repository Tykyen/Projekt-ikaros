/**
 * Spec 2.4 — payload pending položky `world_join_request` (Zpracovat tab PJ).
 * Vrací `WorldJoinRequestProvider.listForUser`.
 */
export interface WorldJoinRequestListItem {
  /** ID pending `WorldMembership` (role=Zadatel) — slouží pro accept/reject endpointy. */
  membershipId: string;
  worldId: string;
  worldName: string;
  worldSlug: string;
  /** ISO timestamp žádosti (= `WorldMembership.joinedAt`). */
  requestedAt: string;
  requester: {
    id: string;
    username: string;
    avatarUrl?: string;
  };
}
