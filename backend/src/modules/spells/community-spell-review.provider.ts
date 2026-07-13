import { Injectable } from '@nestjs/common';
import type { IPendingActionProvider } from '../pending-actions/pending-action-provider.interface';
import { PendingActionType } from '../pending-actions/pending-action-type.enum';
import { UserRole } from '../users/interfaces/user.interface';
import { SpellsRepository } from './repositories/spells.repository';
import { isBestieCurator } from '../bestiae/curator-roles';
import type { CommunitySpellReviewListItem } from './interfaces/community-spell-review-list-item.interface';

/**
 * 21.5c — provider pending fronty „kouzla ke schválení" (Zpracovat tab,
 * architektura 1.4). Registrován v `SpellsModule.onModuleInit()`. Vidí ho
 * kurátoři (správci diskusí/článků + Admin/Superadmin) — draft kouzla čekající
 * na povýšení do schválené knihovny. Vzor: CommunityPlantReviewProvider.
 */
@Injectable()
export class CommunitySpellReviewProvider implements IPendingActionProvider<CommunitySpellReviewListItem> {
  readonly type = PendingActionType.CommunitySpellPendingReview;

  constructor(private readonly repo: SpellsRepository) {}

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
  ): Promise<{ items: CommunitySpellReviewListItem[]; total: number }> {
    if (!this.canHandle(_userId, role)) return { items: [], total: 0 };
    const offset = Math.max(0, (page - 1) * limit);
    const [spells, total] = await Promise.all([
      this.repo.findMany({ status: 'draft', skip: offset, limit }),
      this.repo.count({ status: 'draft' }),
    ]);
    const items: CommunitySpellReviewListItem[] = spells.map((s) => ({
      spellId: s.id,
      name: s.name,
      aliases: s.aliases,
      systemId: s.systemId,
      authorId: s.authorId,
      submittedAt: s.createdAt.toISOString(),
    }));
    return { items, total };
  }
}
