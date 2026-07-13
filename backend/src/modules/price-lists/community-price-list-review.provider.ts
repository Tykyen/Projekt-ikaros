import { Injectable } from '@nestjs/common';
import type { IPendingActionProvider } from '../pending-actions/pending-action-provider.interface';
import { PendingActionType } from '../pending-actions/pending-action-type.enum';
import { UserRole } from '../users/interfaces/user.interface';
import { PriceListsRepository } from './repositories/price-lists.repository';
import { isBestieCurator } from '../bestiae/curator-roles';
import type { CommunityPriceListReviewListItem } from './interfaces/community-price-list-review-list-item.interface';

/**
 * 21.5f — provider pending fronty „ceníky ke schválení" (Zpracovat tab,
 * architektura 1.4). Registrován v `PriceListsModule.onModuleInit()`. Vidí ho
 * kurátoři (správci diskusí/článků + Admin/Superadmin) — draft ceníky čekající
 * na povýšení do schválené knihovny. Vzor: CommunityPlantReviewProvider.
 */
@Injectable()
export class CommunityPriceListReviewProvider implements IPendingActionProvider<CommunityPriceListReviewListItem> {
  readonly type = PendingActionType.CommunityPriceListPendingReview;

  constructor(private readonly repo: PriceListsRepository) {}

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
  ): Promise<{ items: CommunityPriceListReviewListItem[]; total: number }> {
    if (!this.canHandle(_userId, role)) return { items: [], total: 0 };
    const offset = Math.max(0, (page - 1) * limit);
    const [lists, total] = await Promise.all([
      this.repo.findMany({ status: 'draft', skip: offset, limit }),
      this.repo.count({ status: 'draft' }),
    ]);
    const items: CommunityPriceListReviewListItem[] = lists.map((l) => ({
      priceListId: l.id,
      name: l.name,
      itemCount: l.items.length,
      authorId: l.authorId,
      submittedAt: l.createdAt.toISOString(),
    }));
    return { items, total };
  }
}
