import { Injectable, Inject } from '@nestjs/common';
import type { IPendingActionProvider } from '../pending-actions/pending-action-provider.interface';
import { PendingActionType } from '../pending-actions/pending-action-type.enum';
import { UserRole } from '../users/interfaces/user.interface';
import type { IIkarosGalleryRepository } from './interfaces/ikaros-gallery-repository.interface';
import type { GalleryReviewListItem } from './interfaces/gallery-review-list-item.interface';

// 3.3b — galerie je platformový obsah → bez world-scoped PJ.
const REVIEWER_ROLES: UserRole[] = [
  UserRole.Superadmin,
  UserRole.Admin,
  UserRole.SpravceGalerie,
];

/**
 * Spec 3.3b — provider pro Zpracovat tab (1.4 architektura). Registrován
 * v `IkarosGalleryModule.onModuleInit()`. SpravceGalerie/Admin/Superadmin
 * vidí pending obrázky jako frontu položek; každá karta má 2 akce
 * (Schválit, Vrátit s poznámkou).
 */
@Injectable()
export class GalleryReviewProvider implements IPendingActionProvider<GalleryReviewListItem> {
  readonly type = PendingActionType.GalleryPendingReview;

  constructor(
    @Inject('IIkarosGalleryRepository')
    private readonly repo: IIkarosGalleryRepository,
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
  ): Promise<{ items: GalleryReviewListItem[]; total: number }> {
    if (!this.canHandle(userId, role)) return { items: [], total: 0 };
    const offset = Math.max(0, (page - 1) * limit);
    const [images, total] = await Promise.all([
      this.repo.findPendingPaginated(offset, limit),
      this.repo.countPending(),
    ]);
    const items: GalleryReviewListItem[] = images.map((img) => ({
      imageId: img.id,
      title: img.title,
      imageUrl: img.imageUrl,
      category: img.category,
      authorId: img.authorId,
      authorName: img.authorName,
      submittedAt: img.updatedAtUtc.toISOString(),
    }));
    return { items, total };
  }
}
