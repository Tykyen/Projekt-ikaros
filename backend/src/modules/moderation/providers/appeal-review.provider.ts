import { Inject, Injectable } from '@nestjs/common';
import type { IPendingActionProvider } from '../../pending-actions/pending-action-provider.interface';
import { PendingActionType } from '../../pending-actions/pending-action-type.enum';
import { UserRole } from '../../users/interfaces/user.interface';
import type { IModerationAppealsRepository } from '../interfaces/moderation-appeals-repository.interface';
import type { IModerationDecisionsRepository } from '../interfaces/moderation-decisions-repository.interface';
import type {
  AppealReviewListItem,
  ModerationAppeal,
} from '../interfaces/moderation-entities.interface';
import { isContentReviewer } from '../moderation.constants';

/**
 * Spec 20B (B4a, DSA čl. 20) — provider fronty přezkumu odvolání
 * (queue `moderation_appeal`). Gate = content reviewer set.
 *
 * ⚠️ Ve frontě NEfiltrujeme odvolání, kde je uživatel původní moderátor — pro
 * jednoduchost B4a je zobrazíme všem reviewerům a self-review (reviewer ==
 * decision.moderatorId) zastaví až review endpoint (invariant tam vynucen).
 */
@Injectable()
export class AppealReviewProvider implements IPendingActionProvider<AppealReviewListItem> {
  readonly type = PendingActionType.ModerationAppeal;

  constructor(
    @Inject('IModerationAppealsRepository')
    private readonly appealsRepo: IModerationAppealsRepository,
    @Inject('IModerationDecisionsRepository')
    private readonly decisionsRepo: IModerationDecisionsRepository,
  ) {}

  canHandle(_userId: string, role: UserRole): boolean {
    return isContentReviewer(role);
  }

  async countForUser(userId: string, role: UserRole): Promise<number> {
    if (!this.canHandle(userId, role)) return 0;
    return this.appealsRepo.countByStatus('pending');
  }

  async listForUser(
    userId: string,
    role: UserRole,
    page: number,
    limit: number,
  ): Promise<{ items: AppealReviewListItem[]; total: number }> {
    if (!this.canHandle(userId, role)) return { items: [], total: 0 };
    const offset = Math.max(0, (page - 1) * limit);
    const [appeals, total] = await Promise.all([
      this.appealsRepo.findByStatus('pending', offset, limit),
      this.appealsRepo.countByStatus('pending'),
    ]);
    const items = await Promise.all(appeals.map((a) => this.toListItem(a)));
    return { items, total };
  }

  /** Denormalizace kontextu z rozhodnutí (action, targetType) pro reviewera. */
  private async toListItem(a: ModerationAppeal): Promise<AppealReviewListItem> {
    const decision = await this.decisionsRepo.findById(a.decisionId);
    return {
      appealId: a.id,
      decisionId: a.decisionId,
      appellantName: a.appellantName,
      reason: a.reason,
      action: decision?.action,
      targetType: decision?.targetType,
      createdAt: a.createdAtUtc.toISOString(),
    };
  }
}
