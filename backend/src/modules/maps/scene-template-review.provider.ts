import { Inject, Injectable } from '@nestjs/common';
import type { IPendingActionProvider } from '../pending-actions/pending-action-provider.interface';
import { PendingActionType } from '../pending-actions/pending-action-type.enum';
import { UserRole } from '../users/interfaces/user.interface';
import { isBestieCurator } from '../bestiae/curator-roles';
import type { IMapTemplatesRepository } from './interfaces/map-templates-repository.interface';

/** Položka fronty „šablony scén ke schválení" (Zpracovat tab). */
export interface SceneTemplateReviewListItem {
  templateId: string;
  name: string;
  imageUrl: string;
  publicAuthorName: string;
  authorId: string;
  submittedAt: string;
}

/**
 * 22.5 — provider pending fronty „publikované šablony scén ke schválení"
 * (Zpracovat tab, architektura 1.4). Registrován v `MapsModule.onModuleInit()`.
 * Vidí ho kurátoři (`isBestieCurator` — správci diskusí/článků + Admin+).
 */
@Injectable()
export class SceneTemplateReviewProvider implements IPendingActionProvider<SceneTemplateReviewListItem> {
  readonly type = PendingActionType.CommunitySceneTemplatePendingReview;

  constructor(
    @Inject('IMapTemplatesRepository')
    private readonly repo: IMapTemplatesRepository,
  ) {}

  canHandle(_userId: string, role: UserRole): boolean {
    return isBestieCurator(role);
  }

  async countForUser(_userId: string, role: UserRole): Promise<number> {
    if (!this.canHandle(_userId, role)) return 0;
    return this.repo.countPendingReview();
  }

  async listForUser(
    _userId: string,
    role: UserRole,
    page: number,
    limit: number,
  ): Promise<{ items: SceneTemplateReviewListItem[]; total: number }> {
    if (!this.canHandle(_userId, role)) return { items: [], total: 0 };
    const offset = Math.max(0, (page - 1) * limit);
    const [tpls, total] = await Promise.all([
      this.repo.findPendingReview({ skip: offset, limit }),
      this.repo.countPendingReview(),
    ]);
    const items: SceneTemplateReviewListItem[] = tpls.map((t) => ({
      templateId: t.id,
      name: t.name,
      imageUrl: t.imageUrl,
      publicAuthorName: t.publicAuthorName ?? 'Neznámý autor',
      authorId: t.authorId ?? '',
      submittedAt: (t.publishedAt ?? t.updatedAt ?? new Date()).toISOString(),
    }));
    return { items, total };
  }
}
