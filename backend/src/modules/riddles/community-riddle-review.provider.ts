import { Injectable } from '@nestjs/common';
import type { IPendingActionProvider } from '../pending-actions/pending-action-provider.interface';
import { PendingActionType } from '../pending-actions/pending-action-type.enum';
import { UserRole } from '../users/interfaces/user.interface';
import { RiddlesRepository } from './repositories/riddles.repository';
import { isBestieCurator } from '../bestiae/curator-roles';
import type { CommunityRiddleReviewListItem } from './interfaces/community-riddle-review-list-item.interface';

/**
 * 21.5d — provider pending fronty „hádanky ke schválení" (Zpracovat tab,
 * architektura 1.4). Registrován v `RiddlesModule.onModuleInit()`. Vidí ho
 * kurátoři (správci diskusí/článků + Admin/Superadmin).
 */
@Injectable()
export class CommunityRiddleReviewProvider implements IPendingActionProvider<CommunityRiddleReviewListItem> {
  readonly type = PendingActionType.CommunityRiddlePendingReview;

  constructor(private readonly repo: RiddlesRepository) {}

  canHandle(_userId: string, role: UserRole): boolean {
    return isBestieCurator(role);
  }

  async countForUser(_userId: string, role: UserRole): Promise<number> {
    if (!this.canHandle(_userId, role)) return 0;
    return this.repo.count({ status: 'draft' });
  }

  async listForUser(
    _userId: string,
    role: UserRole,
    page: number,
    limit: number,
  ): Promise<{ items: CommunityRiddleReviewListItem[]; total: number }> {
    if (!this.canHandle(_userId, role)) return { items: [], total: 0 };
    const offset = Math.max(0, (page - 1) * limit);
    const [found, total] = await Promise.all([
      this.repo.findMany({ status: 'draft', skip: offset, limit }),
      this.repo.count({ status: 'draft' }),
    ]);
    const items: CommunityRiddleReviewListItem[] = found.map((r) => ({
      riddleId: r.id,
      question:
        r.question.length > 120 ? r.question.slice(0, 117) + '…' : r.question,
      difficulty: r.difficulty,
      authorId: r.authorId,
      submittedAt: r.createdAt.toISOString(),
    }));
    return { items, total };
  }
}
