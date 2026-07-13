import { Injectable } from '@nestjs/common';
import type { IPendingActionProvider } from '../pending-actions/pending-action-provider.interface';
import { PendingActionType } from '../pending-actions/pending-action-type.enum';
import { UserRole } from '../users/interfaces/user.interface';
import { PotionsRepository } from './repositories/potions.repository';
import { isBestieCurator } from '../bestiae/curator-roles';
import type { CommunityPotionReviewListItem } from './interfaces/community-potion-review-list-item.interface';

/**
 * 21.5b — provider pending fronty „lektvary ke schválení" (Zpracovat tab,
 * architektura 1.4). Registrován v `PotionsModule.onModuleInit()`. Vidí ho
 * kurátoři (správci diskusí/článků + Admin/Superadmin). Vzor:
 * CommunitySpellReviewProvider (21.5c).
 */
@Injectable()
export class CommunityPotionReviewProvider implements IPendingActionProvider<CommunityPotionReviewListItem> {
  readonly type = PendingActionType.CommunityPotionPendingReview;

  constructor(private readonly repo: PotionsRepository) {}

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
  ): Promise<{ items: CommunityPotionReviewListItem[]; total: number }> {
    if (!this.canHandle(_userId, role)) return { items: [], total: 0 };
    const offset = Math.max(0, (page - 1) * limit);
    const [potions, total] = await Promise.all([
      this.repo.findMany({ status: 'draft', skip: offset, limit }),
      this.repo.count({ status: 'draft' }),
    ]);
    const items: CommunityPotionReviewListItem[] = potions.map((p) => ({
      potionId: p.id,
      name: p.name,
      aliases: p.aliases,
      kind: p.kind,
      systemId: p.systemId,
      authorId: p.authorId,
      submittedAt: p.createdAt.toISOString(),
    }));
    return { items, total };
  }
}
