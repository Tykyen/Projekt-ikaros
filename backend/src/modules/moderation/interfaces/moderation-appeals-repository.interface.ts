import type {
  ModerationAppeal,
  ModerationAppealOutcome,
  ModerationAppealStatus,
} from './moderation-entities.interface';

/** Spec 20B — repo pro kolekci `moderation_appeals` (odvolání, DSA čl. 20). */
export interface IModerationAppealsRepository {
  create(data: Omit<ModerationAppeal, 'id'>): Promise<ModerationAppeal>;
  findById(id: string): Promise<ModerationAppeal | null>;
  findByDecision(decisionId: string): Promise<ModerationAppeal[]>;
  /** Odvolání daného stavu (fronta přezkumu), nejnovější první, paginovaně. */
  findByStatus(
    status: ModerationAppealStatus,
    offset: number,
    limit: number,
  ): Promise<ModerationAppeal[]>;
  countByStatus(status: ModerationAppealStatus): Promise<number>;
  /**
   * B4a — uzavře odvolání přezkumem: `status = outcome`, reviewer + poznámka,
   * `resolvedAtUtc = now`.
   */
  markReviewed(
    id: string,
    data: {
      status: ModerationAppealOutcome;
      reviewerId: string;
      reviewerNote: string;
    },
  ): Promise<void>;
}
