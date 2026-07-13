import {
  Injectable,
  Inject,
  Optional,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { logWarn } from '../../common/logging/log-error.util';
import { PushService } from '../push/push.service';
import type { IIkarosGalleryRepository } from './interfaces/ikaros-gallery-repository.interface';
import type { IkarosGalleryItem } from './interfaces/ikaros-gallery.interface';
import type { IUsersRepository } from '../users/interfaces/users-repository.interface';
import { UsersService } from '../users/users.service';
import type { IkarosMessagesService } from '../ikaros-messages/ikaros-messages.service';
import type { UploadService } from '../upload/upload.service';
import { UserRole } from '../users/interfaces/user.interface';
import {
  MAX_PINNED,
  toggleFavoriteId,
  togglePinnedId,
} from '../users/favorites-toggle.util';
import type { CreateGalleryItemDto } from './dto/create-gallery-item.dto';
import type { UpdateGalleryItemDto } from './dto/update-gallery-item.dto';
import type { GalleryCategoriesService } from './gallery-categories.service';
import type { GalleryAiOrigin } from './interfaces/ikaros-gallery.interface';
// 20D (D3) — doklad souhlasu s právy při uploadu.
import { UploadConsentsService } from '../upload-consents/upload-consents.service';
import { assertUnderCreationLimit } from '../../common/limits/creation-limits';

// 3.3a — galerie je platformový obsah → jen globální role, bez world-scoped PJ.
const ADMIN_ROLES = [
  UserRole.Superadmin,
  UserRole.Admin,
  UserRole.SpravceGalerie,
];
const DEFAULT_CATEGORY = 'ostatni';
const SYSTEM_SENDER = { id: 'system', username: 'Systém' };
// 3.7 — favorites/pin toggle sdílený helper (D-NEW-INV-CLEANUP)
const FAVORITE_FIELDS = {
  favorites: 'favoriteGalleryIds',
  pinned: 'pinnedGalleryIds',
} as const;

/** 3.3a — statistiky autora pro tab „Moje obrázky". */
export interface GalleryStats {
  draft: number;
  pending: number;
  published: number;
  rejected: number;
  totalRatings: number;
  averageRating: number;
}

@Injectable()
export class IkarosGalleryService {
  constructor(
    @Inject('IIkarosGalleryRepository')
    private readonly repo: IIkarosGalleryRepository,
    @Inject('IUsersRepository') private readonly usersRepo: IUsersRepository,
    // D-040 — tombstone batch enrich pro `authorIsDeleted` v gallery responses.
    private readonly usersService: UsersService,
    @Inject('IkarosMessagesService')
    private readonly msgService: IkarosMessagesService,
    @Inject('UploadService') private readonly uploadService: UploadService,
    @Inject('GalleryCategoriesService')
    private readonly categoriesService: GalleryCategoriesService,
    // 20D (D3) — audit log souhlasů; @Optional pro starší testy bez modulu.
    @Optional()
    private readonly uploadConsents?: UploadConsentsService,
    // 15.9 — push autorovi; @Optional pro starší testy bez PushModule.
    @Optional()
    private readonly pushService?: PushService,
  ) {}

  private readonly logger = new Logger(IkarosGalleryService.name);

  /** 15.9 — fire-and-forget push autorovi obsahu (kategorie `ownContent`). */
  private pushAuthor(
    authorId: string,
    title: string,
    body: string,
    itemId: string,
  ): void {
    void this.pushService
      ?.notify(
        authorId,
        { title, body: body.slice(0, 120), url: `/ikaros/galerie/${itemId}` },
        'ownContent',
      )
      .catch((err: unknown) =>
        logWarn(this.logger, 'push selhal pro gallery item', err),
      );
  }

  /** D-040 — batch enrich authorIsDeleted na gallery items. */
  private async enrichTombstoneAuthors(
    items: IkarosGalleryItem[],
  ): Promise<IkarosGalleryItem[]> {
    if (items.length === 0) return items;
    const ids = Array.from(new Set(items.map((i) => i.authorId)));
    const info = await this.usersService.findManyTombstoneInfo(ids);
    return items.map((i) => ({
      ...i,
      authorIsDeleted: info.get(i.authorId)?.isDeleted ?? false,
    }));
  }

  /** D-040 — single-item variant. */
  private async enrichTombstoneAuthor(
    item: IkarosGalleryItem,
  ): Promise<IkarosGalleryItem> {
    const info = await this.usersService.findManyTombstoneInfo([item.authorId]);
    return {
      ...item,
      authorIsDeleted: info.get(item.authorId)?.isDeleted ?? false,
    };
  }

  /**
   * 3.3a — ověří kategorii. Prázdná → výchozí `ostatni`. Neexistující slug
   * → BadRequest (chrání před FK na smazanou/překlepnutou kategorii).
   */
  private async resolveCategory(category?: string): Promise<string> {
    if (!category) return DEFAULT_CATEGORY;
    if (!(await this.categoriesService.existsByKey(category))) {
      throw new BadRequestException({
        code: 'GALLERY_CATEGORY_INVALID',
        message: `Kategorie '${category}' neexistuje`,
      });
    }
    return category;
  }

  // R-RUN-03 (plný audit 2026-06-20) — odstraněn `username === 'Tyky'` backdoor
  // (rename-útok); Tyky má plnou moc přes roli Superadmin v ADMIN_ROLES.
  isAdmin(role?: UserRole, _username?: string): boolean {
    return role !== undefined && ADMIN_ROLES.includes(role);
  }

  private assertAdmin(role?: UserRole, username?: string): void {
    if (!this.isAdmin(role, username))
      throw new ForbiddenException({
        code: 'GALLERY_FORBIDDEN',
        message: 'Nedostatečná oprávnění',
      });
  }

  private async notifyAdmins(subject: string, body: string): Promise<void> {
    // D-NEW-INV-CLEANUP — Tyky je primární Superadmin ∈ ADMIN_ROLES, takže už je
    // v `admins`; hardcoded `findByUsername('Tyky')` fallback byl redundantní
    // (rename-útok řeší role, ne jméno — viz isAdmin R-RUN-03).
    const admins = await this.usersRepo.findByRoles(ADMIN_ROLES);
    await Promise.all(
      admins.map((r) =>
        this.msgService.create(
          { recipientId: r.id, recipientName: r.username, subject, body },
          SYSTEM_SENDER,
        ),
      ),
    );
  }

  private async notifyUser(
    recipientId: string,
    recipientName: string,
    subject: string,
    body: string,
  ): Promise<void> {
    await this.msgService.create(
      { recipientId, recipientName, subject, body },
      SYSTEM_SENDER,
    );
  }

  async findAll(
    role?: UserRole,
    username?: string,
  ): Promise<IkarosGalleryItem[]> {
    const items = this.isAdmin(role, username)
      ? await this.repo.findPublishedAndPending()
      : await this.repo.findPublished();
    return this.enrichTombstoneAuthors(items);
  }

  async findMy(authorId: string): Promise<IkarosGalleryItem[]> {
    const items = await this.repo.findByAuthor(authorId);
    return this.enrichTombstoneAuthors(items);
  }

  async findPending(
    role: UserRole,
    username: string,
  ): Promise<IkarosGalleryItem[]> {
    this.assertAdmin(role, username);
    const items = await this.repo.findPending();
    return this.enrichTombstoneAuthors(items);
  }

  async findById(
    id: string,
    userId?: string,
    role?: UserRole,
    username?: string,
  ): Promise<IkarosGalleryItem> {
    const item = await this.repo.findById(id);
    if (!item)
      throw new NotFoundException({
        code: 'GALLERY_ITEM_NOT_FOUND',
        message: 'Obrázek nenalezen',
      });
    // B4b (spec 20B) — moderačně skrytý obrázek (M2/M3): vidí ho jen reviewer
    // (content-admin set), ostatním (vč. autora a anonyma) vracíme 404, aby se
    // neprozradila existence skrytého obsahu (auth-leak-policy).
    if (item.moderationHidden && !this.isAdmin(role, username)) {
      throw new NotFoundException({
        code: 'GALLERY_ITEM_NOT_FOUND',
        message: 'Obrázek nenalezen',
      });
    }
    if (
      item.status !== 'Published' &&
      item.authorId !== userId &&
      !this.isAdmin(role, username)
    ) {
      throw new ForbiddenException({
        code: 'GALLERY_ACCESS_DENIED',
        message: 'Přístup odepřen',
      });
    }
    return this.enrichTombstoneAuthor(item);
  }

  async create(
    dto: CreateGalleryItemDto,
    file: Express.Multer.File,
    authorId: string,
    authorName: string,
    _role: UserRole,
    ip?: string,
  ): Promise<IkarosGalleryItem> {
    if (!file)
      throw new BadRequestException({
        code: 'GALLERY_FILE_REQUIRED',
        message: 'Soubor obrázku je povinný',
      });
    // 20D (D1) — bez prohlášení práv nelze nahrát. Gate i na BE (ne jen FE
    // disable), aby byl audit doklad (D3) vždy podložený reálným souhlasem.
    if (dto.rightsDeclared !== true)
      throw new BadRequestException({
        code: 'GALLERY_RIGHTS_NOT_DECLARED',
        message: 'Bez prohlášení o právech k obsahu nelze obrázek nahrát',
      });
    // D-SEC-GAP-2026-07-11 — anti-abuse creation-flood: kumulativní strop
    // galerie per účet. Záměrně PŘED uploadem (žádný orphan blob).
    assertUnderCreationLimit(
      await this.repo.countByAuthor(authorId),
      'MAX_GALLERY_ITEMS_PER_USER',
      'obrázků v galerii na účet',
    );
    const category = await this.resolveCategory(dto.category);
    // 20D (D1) — self-declared AI původ; cokoli jiného než 'ai_image' → 'none'.
    const aiOrigin: GalleryAiOrigin =
      dto.aiOrigin === 'ai_image' ? 'ai_image' : 'none';
    const { url, publicId, width, height, bytes } =
      await this.uploadService.uploadGalleryImage(file);
    const status = dto.submit ? 'Pending' : 'Draft';
    const item = await this.repo.create({
      title: dto.title,
      description: dto.description,
      imageUrl: url,
      publicId,
      width,
      height,
      bytes, // D-19.2 — velikost blobu (server-side z uploadu)
      category,
      authorId,
      authorName,
      status,
      ratings: [],
      averageRating: 0,
      aiOrigin,
      createdAtUtc: new Date(),
      updatedAtUtc: new Date(),
    });
    // 20D (D3) — zapiš doklad souhlasu do audit logu. Best-effort: modul je
    // @Optional (starší testy), a service sama chybu jen loguje (upload už proběhl).
    if (this.uploadConsents) {
      const author = await this.usersRepo.findById(authorId);
      await this.uploadConsents.record({
        userId: authorId,
        targetType: 'gallery',
        targetId: item.id,
        aiDeclared: aiOrigin !== 'none',
        termsVersion: author?.termsVersion ?? '',
        ip,
      });
    }
    if (status === 'Pending') {
      await this.notifyAdmins(
        'Obrázek čeká na schválení',
        `/ikaros/galerie/${item.id}`,
      );
    }
    return item;
  }

  async update(
    id: string,
    dto: UpdateGalleryItemDto,
    userId: string,
    _role: UserRole,
    _username: string,
  ): Promise<IkarosGalleryItem> {
    const item = await this.repo.findById(id);
    if (!item)
      throw new NotFoundException({
        code: 'GALLERY_ITEM_NOT_FOUND',
        message: 'Obrázek nenalezen',
      });
    if (item.authorId !== userId)
      throw new ForbiddenException({
        code: 'GALLERY_ACCESS_DENIED',
        message: 'Přístup odepřen',
      });
    if (item.status !== 'Draft' && item.status !== 'Rejected') {
      throw new BadRequestException(
        'Editovat lze jen Draft nebo Rejected obrázek',
      );
    }
    if (dto.category !== undefined) {
      await this.resolveCategory(dto.category);
    }
    const updated = await this.repo.update(id, {
      ...dto,
      updatedAtUtc: new Date(),
    });
    return updated!;
  }

  async delete(
    id: string,
    userId: string,
    role: UserRole,
    username: string,
  ): Promise<void> {
    const item = await this.repo.findById(id);
    if (!item)
      throw new NotFoundException({
        code: 'GALLERY_ITEM_NOT_FOUND',
        message: 'Obrázek nenalezen',
      });
    if (item.authorId !== userId && !this.isAdmin(role, username)) {
      throw new ForbiddenException({
        code: 'GALLERY_ACCESS_DENIED',
        message: 'Přístup odepřen',
      });
    }
    await this.repo.delete(id);
    // 3.3a — uvolnit Cloudinary asset (best-effort, chyba se jen loguje)
    await this.uploadService.deleteImage(item.publicId);
  }

  async submit(
    id: string,
    userId: string,
    _role: UserRole,
  ): Promise<IkarosGalleryItem> {
    const item = await this.repo.findById(id);
    if (!item)
      throw new NotFoundException({
        code: 'GALLERY_ITEM_NOT_FOUND',
        message: 'Obrázek nenalezen',
      });
    if (item.authorId !== userId)
      throw new ForbiddenException({
        code: 'GALLERY_ACCESS_DENIED',
        message: 'Přístup odepřen',
      });
    if (item.status !== 'Draft' && item.status !== 'Rejected') {
      throw new BadRequestException(
        'Odeslat lze jen Draft nebo Rejected obrázek',
      );
    }
    const updated = await this.repo.update(id, {
      status: 'Pending',
      updatedAtUtc: new Date(),
    });
    await this.notifyAdmins(
      'Obrázek čeká na schválení',
      `/ikaros/galerie/${id}`,
    );
    return updated!;
  }

  async approve(
    id: string,
    role: UserRole,
    username: string,
  ): Promise<IkarosGalleryItem> {
    this.assertAdmin(role, username);
    const item = await this.repo.findById(id);
    if (!item)
      throw new NotFoundException({
        code: 'GALLERY_ITEM_NOT_FOUND',
        message: 'Obrázek nenalezen',
      });
    if (item.status !== 'Pending')
      throw new BadRequestException({
        code: 'GALLERY_ITEM_NOT_PENDING',
        message: 'Schválit lze jen Pending obrázek',
      });
    const updated = await this.repo.update(id, {
      status: 'Published',
      publishedAtUtc: new Date(),
      updatedAtUtc: new Date(),
    });
    await this.notifyUser(
      item.authorId,
      item.authorName,
      'Obrázek schválen',
      `Tvůj obrázek "${item.title}" byl schválen.`,
    );
    this.pushAuthor(
      item.authorId,
      'Obrázek schválen',
      `Tvůj obrázek „${item.title}“ byl schválen.`,
      id,
    );
    return updated!;
  }

  async reject(
    id: string,
    reason: string,
    role: UserRole,
    username: string,
  ): Promise<IkarosGalleryItem> {
    this.assertAdmin(role, username);
    const item = await this.repo.findById(id);
    if (!item)
      throw new NotFoundException({
        code: 'GALLERY_ITEM_NOT_FOUND',
        message: 'Obrázek nenalezen',
      });
    if (item.status !== 'Pending')
      throw new BadRequestException({
        code: 'GALLERY_ITEM_NOT_PENDING',
        message: 'Zamítnout lze jen Pending obrázek',
      });
    const updated = await this.repo.update(id, {
      status: 'Rejected',
      rejectReason: reason,
      updatedAtUtc: new Date(),
    });
    await this.notifyUser(
      item.authorId,
      item.authorName,
      'Obrázek zamítnut',
      `Tvůj obrázek "${item.title}" byl zamítnut. Důvod: ${reason}`,
    );
    this.pushAuthor(
      item.authorId,
      'Obrázek zamítnut',
      `Tvůj obrázek „${item.title}“ byl zamítnut. Důvod: ${reason}`,
      id,
    );
    return updated!;
  }

  async rate(
    id: string,
    stars: number,
    userId: string,
    _role: UserRole,
    userName = '',
    text = '',
  ): Promise<{ averageRating: number; totalRatings: number }> {
    const item = await this.repo.findById(id);
    if (!item)
      throw new NotFoundException({
        code: 'GALLERY_ITEM_NOT_FOUND',
        message: 'Obrázek nenalezen',
      });
    if (item.status !== 'Published')
      throw new BadRequestException({
        code: 'GALLERY_ITEM_NOT_PUBLISHED',
        message: 'Hodnotit lze jen Published obrázek',
      });
    if (item.authorId === userId)
      throw new ForbiddenException({
        code: 'GALLERY_SELF_RATING',
        message: 'Autor nemůže hodnotit vlastní obrázek',
      });
    const updated = await this.repo.upsertRating(id, {
      userId,
      stars,
      userName,
      text: text.trim(),
      createdAtUtc: new Date(),
    });
    this.pushAuthor(
      item.authorId,
      'Nové hodnocení obrázku',
      `${userName || 'Někdo'} ohodnotil „${item.title}“ (${stars}★)`,
      id,
    );
    return {
      averageRating: updated?.averageRating ?? 0,
      totalRatings: updated?.ratings.length ?? 0,
    };
  }

  /** 3.3a — statistiky obrázků autora pro tab „Moje obrázky". */
  async findStats(authorId: string): Promise<GalleryStats> {
    const counts = await this.repo.countByAuthorAndStatus(authorId);
    const mine = await this.repo.findByAuthor(authorId);
    const published = mine.filter((i) => i.status === 'Published');
    const totalRatings = published.reduce(
      (sum, i) => sum + i.ratings.length,
      0,
    );
    const rated = published.filter((i) => i.ratings.length > 0);
    const averageRating =
      rated.length > 0
        ? Math.round(
            (rated.reduce((sum, i) => sum + i.averageRating, 0) /
              rated.length) *
              10,
          ) / 10
        : 0;
    return {
      draft: counts.Draft,
      pending: counts.Pending,
      published: counts.Published,
      rejected: counts.Rejected,
      totalRatings,
      averageRating,
    };
  }

  // ───────────────────────────────────────────────────────────────────────
  // 3.7 — oblíbené (záložky) + připnutí do sidebaru
  // ───────────────────────────────────────────────────────────────────────

  async findMyFavorites(userId: string): Promise<IkarosGalleryItem[]> {
    const user = await this.usersRepo.findById(userId);
    if (!user) return [];
    const ids = user.favoriteGalleryIds ?? [];
    if (ids.length === 0) return [];
    const items = await this.repo.findByIds(ids);
    // FIX-9 (leak fix, vzor ikaros-articles findMyFavorites) — status brána:
    // dřív se vracel plný obsah bez filtru, takže přes toggle-favorite (které
    // status neověřuje) šlo číst cizí Draft/Pending/Rejected. Published vidí
    // každý; Pending navíc admin; Draft/Rejected jen autor.
    const isAdmin = this.isAdmin(user.role, user.username);
    const visible = items.filter((i) =>
      this.canViewGalleryItem(i, userId, isAdmin),
    );
    return this.enrichTombstoneAuthors(visible);
  }

  /** FIX-9 — smí requester vidět plný obrázek (dle statusu/autorství)? */
  private canViewGalleryItem(
    item: IkarosGalleryItem,
    userId: string,
    isAdmin: boolean,
  ): boolean {
    // B4b — moderačně skrytý obrázek vidí jen reviewer (i v oblíbených).
    if (item.moderationHidden && !isAdmin) return false;
    if (item.status === 'Published') return true;
    if (item.authorId === userId) return true;
    if (item.status === 'Pending' && isAdmin) return true;
    return false;
  }

  /**
   * B4b (spec 20B) — moderační skrytí / odkrytí obrázku (akce M2/M3 a revert).
   * Systémová cesta z enforcement listeneru; bez autorského/role guardu
   * (autorizoval už moderační zásah). Na neznámém id vrátí false, nikdy nehází.
   */
  async setModerationHidden(
    id: string,
    hidden: boolean,
    reason?: string,
  ): Promise<boolean> {
    const updated = await this.repo.update(id, {
      moderationHidden: hidden,
      moderationHiddenReason: hidden ? reason : undefined,
    });
    return updated !== null;
  }

  /** Existence check pro favorites/pin toggle (sdílený helper). */
  private async requireItemExists(itemId: string): Promise<void> {
    const item = await this.repo.findById(itemId);
    if (!item)
      throw new NotFoundException({
        code: 'GALLERY_ITEM_NOT_FOUND',
        message: 'Obrázek nenalezen',
      });
  }

  async toggleFavorite(
    itemId: string,
    userId: string,
  ): Promise<{ isFavorite: boolean }> {
    return toggleFavoriteId({
      usersRepo: this.usersRepo,
      userId,
      itemId,
      fields: FAVORITE_FIELDS,
      ensureItemExists: () => this.requireItemExists(itemId),
    });
  }

  async togglePin(
    itemId: string,
    userId: string,
  ): Promise<{ isPinned: boolean }> {
    return togglePinnedId({
      usersRepo: this.usersRepo,
      userId,
      itemId,
      fields: FAVORITE_FIELDS,
      ensureItemExists: () => this.requireItemExists(itemId),
      messages: {
        notFavorite: 'Připnout lze jen oblíbený obrázek',
        pinLimit: `Připnout lze max ${MAX_PINNED} obrázků`,
      },
    });
  }
}
