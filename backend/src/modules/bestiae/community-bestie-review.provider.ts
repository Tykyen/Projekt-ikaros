import { Injectable } from '@nestjs/common';
import type { IPendingActionProvider } from '../pending-actions/pending-action-provider.interface';
import { PendingActionType } from '../pending-actions/pending-action-type.enum';
import { UserRole } from '../users/interfaces/user.interface';
import { BestiaeRepository } from './repositories/bestiae.repository';
import { isBestieCurator } from './curator-roles';
import type { CommunityBestieReviewListItem } from './interfaces/community-bestie-review-list-item.interface';

/**
 * 16.2b-2 — provider pending fronty „komunitní bytosti ke schválení" (Zpracovat
 * tab, architektura 1.4). Registrován v `BestiaeModule.onModuleInit()`.
 * Vidí ho kurátoři (správci diskusí/článků + Admin/Superadmin) — draft bytosti
 * čekající na povýšení do schválené knihovny.
 */
@Injectable()
export class CommunityBestieReviewProvider implements IPendingActionProvider<CommunityBestieReviewListItem> {
  readonly type = PendingActionType.CommunityBestiePendingReview;

  constructor(private readonly repo: BestiaeRepository) {}

  canHandle(_userId: string, role: UserRole): boolean {
    return isBestieCurator(role);
  }

  async countForUser(_userId: string, role: UserRole): Promise<number> {
    if (!this.canHandle(_userId, role)) return 0;
    return this.repo.countCommunity({ status: 'draft' });
  }

  async listForUser(
    _userId: string,
    role: UserRole,
    page: number,
    limit: number,
  ): Promise<{ items: CommunityBestieReviewListItem[]; total: number }> {
    if (!this.canHandle(_userId, role)) return { items: [], total: 0 };
    const offset = Math.max(0, (page - 1) * limit);
    const [beasts, total] = await Promise.all([
      this.repo.findCommunity({ status: 'draft', skip: offset, limit }),
      this.repo.countCommunity({ status: 'draft' }),
    ]);
    const items: CommunityBestieReviewListItem[] = beasts.map((b) => ({
      bestieId: b.id,
      name: b.name,
      latin: b.latin,
      kind: b.kind,
      systemIds: b.statblocks ? Object.keys(b.statblocks) : [],
      authorId: b.authorId ?? '',
      submittedAt: b.createdAt.toISOString(),
    }));
    return { items, total };
  }
}
