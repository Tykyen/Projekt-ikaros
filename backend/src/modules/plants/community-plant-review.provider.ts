import { Injectable } from '@nestjs/common';
import type { IPendingActionProvider } from '../pending-actions/pending-action-provider.interface';
import { PendingActionType } from '../pending-actions/pending-action-type.enum';
import { UserRole } from '../users/interfaces/user.interface';
import { PlantsRepository } from './repositories/plants.repository';
import { isBestieCurator } from '../bestiae/curator-roles';
import type { CommunityPlantReviewListItem } from './interfaces/community-plant-review-list-item.interface';

/**
 * 21.5a — provider pending fronty „rostliny ke schválení" (Zpracovat tab,
 * architektura 1.4). Registrován v `PlantsModule.onModuleInit()`. Vidí ho
 * kurátoři (správci diskusí/článků + Admin/Superadmin) — draft rostliny
 * čekající na povýšení do schválené knihovny. Vzor: CommunityBestieReviewProvider.
 */
@Injectable()
export class CommunityPlantReviewProvider implements IPendingActionProvider<CommunityPlantReviewListItem> {
  readonly type = PendingActionType.CommunityPlantPendingReview;

  constructor(private readonly repo: PlantsRepository) {}

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
  ): Promise<{ items: CommunityPlantReviewListItem[]; total: number }> {
    if (!this.canHandle(_userId, role)) return { items: [], total: 0 };
    const offset = Math.max(0, (page - 1) * limit);
    const [plants, total] = await Promise.all([
      this.repo.findMany({ status: 'draft', skip: offset, limit }),
      this.repo.count({ status: 'draft' }),
    ]);
    const items: CommunityPlantReviewListItem[] = plants.map((p) => ({
      plantId: p.id,
      name: p.name,
      aliases: p.aliases,
      rarity: p.rarity,
      authorId: p.authorId,
      submittedAt: p.createdAt.toISOString(),
    }));
    return { items, total };
  }
}
