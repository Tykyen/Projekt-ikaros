import { Injectable, Inject } from '@nestjs/common';
import type { IPendingActionProvider } from '../../pending-actions/pending-action-provider.interface';
import { PendingActionType } from '../../pending-actions/pending-action-type.enum';
import { UserRole } from '../../users/interfaces/user.interface';
import type { IIkarosDiscussionsRepository } from '../interfaces/ikaros-discussions-repository.interface';
import type { DiscussionReviewListItem } from '../interfaces/discussion-list-items.interface';

// 3.4 — diskuze je platformový obsah → bez world-scoped PJ.
const REVIEWER_ROLES: UserRole[] = [
  UserRole.Superadmin,
  UserRole.Admin,
  UserRole.SpravceDiskuzi,
];

/**
 * Spec 3.4 §7.1 — provider pro Zpracovat tab (queue `discussion_pending_review`).
 * SpravceDiskuzi/Admin/Superadmin vidí neschválené diskuze jako frontu;
 * každá karta má akce Schválit / Vrátit s poznámkou.
 */
@Injectable()
export class DiscussionReviewProvider implements IPendingActionProvider<DiscussionReviewListItem> {
  readonly type = PendingActionType.DiscussionPendingReview;

  constructor(
    @Inject('IIkarosDiscussionsRepository')
    private readonly repo: IIkarosDiscussionsRepository,
  ) {}

  canHandle(_userId: string, role: UserRole): boolean {
    return REVIEWER_ROLES.includes(role);
  }

  async countForUser(userId: string, role: UserRole): Promise<number> {
    if (!this.canHandle(userId, role)) return 0;
    return this.repo.countPending();
  }

  async listForUser(
    userId: string,
    role: UserRole,
    page: number,
    limit: number,
  ): Promise<{ items: DiscussionReviewListItem[]; total: number }> {
    if (!this.canHandle(userId, role)) return { items: [], total: 0 };
    const offset = Math.max(0, (page - 1) * limit);
    const [discussions, total] = await Promise.all([
      this.repo.findPendingPaginated(offset, limit),
      this.repo.countPending(),
    ]);
    const items: DiscussionReviewListItem[] = discussions.map((d) => ({
      discussionId: d.id,
      title: d.title,
      descriptionExcerpt: d.description.slice(0, 200),
      creatorId: d.creatorId,
      creatorName: d.creatorName,
      submittedAt: d.createdAtUtc.toISOString(),
    }));
    return { items, total };
  }
}
