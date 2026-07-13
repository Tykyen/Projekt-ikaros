import { Injectable } from '@nestjs/common';
import type { IPendingActionProvider } from '../pending-actions/pending-action-provider.interface';
import { PendingActionType } from '../pending-actions/pending-action-type.enum';
import { UserRole } from '../users/interfaces/user.interface';
import { NameSetsRepository } from './repositories/name-sets.repository';
import { isBestieCurator } from '../bestiae/curator-roles';
import type { CommunityNameSetReviewListItem } from './interfaces/community-name-set-review-list-item.interface';

/**
 * 21.2a — provider pending fronty „jmenné sady ke schválení" (Zpracovat tab).
 * Registrován v `NameSetsModule.onModuleInit()`. Vzor: CommunityPlantReviewProvider.
 */
@Injectable()
export class CommunityNameSetReviewProvider implements IPendingActionProvider<CommunityNameSetReviewListItem> {
  readonly type = PendingActionType.CommunityNameSetPendingReview;

  constructor(private readonly repo: NameSetsRepository) {}

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
  ): Promise<{ items: CommunityNameSetReviewListItem[]; total: number }> {
    if (!this.canHandle(_userId, role)) return { items: [], total: 0 };
    const offset = Math.max(0, (page - 1) * limit);
    const [sets, total] = await Promise.all([
      this.repo.findMany({ status: 'draft', skip: offset, limit }),
      this.repo.count({ status: 'draft' }),
    ]);
    const items: CommunityNameSetReviewListItem[] = sets.map((s) => ({
      nameSetId: s.id,
      name: s.name,
      category: s.category,
      counts: {
        male: s.maleNames.length,
        female: s.femaleNames.length,
        surnames: s.surnames.length,
      },
      authorId: s.authorId,
      submittedAt: s.createdAt.toISOString(),
    }));
    return { items, total };
  }
}
