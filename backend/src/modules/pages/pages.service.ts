import {
  Injectable,
  Inject,
  Optional,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { sanitizeRichText } from '../../common/utils/sanitize-rich-text';
import { SearchCoordinator } from '../search/search.coordinator';
import { CharactersService } from '../characters/characters.service';
import type { IPagesRepository } from './interfaces/pages-repository.interface';
import type { IWorldMembershipRepository } from '../worlds/interfaces/world-membership-repository.interface';
import type { IWorldsRepository } from '../worlds/interfaces/worlds-repository.interface';
import type { IWorldSettingsRepository } from '../worlds/interfaces/world-settings-repository.interface';
import type {
  Page,
  ShieldedRequirement,
  AccessRequirement,
} from './interfaces/page.interface';
import type { CreatePageDto } from './dto/create-page.dto';
import type { UpdatePageDto } from './dto/update-page.dto';
import { TipTapExtractor } from './tiptap-extractor.service';
import { UserRole } from '../users/interfaces/user.interface';
import { WorldRole } from '../worlds/interfaces/world-membership.interface';

export interface PagesRequester {
  id: string;
  role: UserRole;
}

/**
 * Krok 8.5 — buňky tabulky (klíče i hodnoty) jsou rich-text HTML stringy.
 * Sanitizujeme je stejným allowlistem jako `content` (povolí `<a>` odkazy,
 * zahodí `<script>` apod.).
 */
function sanitizeTable(table: CreatePageDto['table']): CreatePageDto['table'] {
  if (!table) return table;
  return {
    ...table,
    ...(table.headers && {
      headers: table.headers.map((h) => sanitizeRichText(h)),
    }),
    ...(table.values && {
      values: table.values.map((v) => sanitizeRichText(v)),
    }),
  };
}

@Injectable()
export class PagesService {
  private readonly logger = new Logger(PagesService.name);

  constructor(
    @Inject('IPagesRepository') private readonly pagesRepo: IPagesRepository,
    @Inject('IWorldMembershipRepository')
    private readonly membershipRepo: IWorldMembershipRepository,
    @Inject('IWorldsRepository') private readonly worldsRepo: IWorldsRepository,
    @Inject('IWorldSettingsRepository')
    private readonly settingsRepo: IWorldSettingsRepository,
    private readonly tipTapExtractor: TipTapExtractor,
    // Krok 9.1 — pro auto-create Character entity při Page typu PostavaHrace/NPC.
    // Character drží 5 subdokumentů (diary/calendar/finance/inventory/notes);
    // Page má characterRef.characterId pro propojení.
    private readonly charactersService: CharactersService,
    @Optional()
    @Inject(SearchCoordinator)
    private readonly searchCoordinator?: SearchCoordinator,
  ) {}

  async findByWorld(
    worldId: string,
    type?: string,
    userId?: string,
  ): Promise<Page[]> {
    const pages = await this.pagesRepo.findByWorld(worldId, type);
    // Krok 9.1 — bez userId (legacy callers) nepřidávám filter; nové callery
    // by měly userId vždy předat, aby se private polí nedostala neoprávněným.
    if (!userId) return pages;
    const filtered: Page[] = [];
    for (const page of pages) {
      filtered.push(await this.filterPrivateForViewer(page, userId, worldId));
    }
    return filtered;
  }

  async findBySlug(
    slug: string,
    worldId: string,
    userId: string,
  ): Promise<Page> {
    const page = await this.pagesRepo.findBySlugAndWorld(slug, worldId);
    if (!page)
      throw new NotFoundException({
        code: 'PAGE_NOT_FOUND',
        message: 'Stránka nenalezena',
      });
    await this.assertAccess(page, userId, worldId);
    // Krok 9.1 — filtr private polí: vidí jen PJ+ nebo owner postavy.
    return this.filterPrivateForViewer(page, userId, worldId);
  }

  async create(
    dto: CreatePageDto,
    worldId: string,
    requester: PagesRequester,
  ): Promise<Page> {
    await this.assertCanWrite(worldId, requester);
    const slug = dto.slug.toLowerCase();
    const exists = await this.pagesRepo.existsBySlugAndWorld(slug, worldId);
    if (exists)
      throw new ConflictException({
        code: 'PAGE_SLUG_TAKEN',
        message: 'Slug již existuje v tomto světě',
      });
    // D-NEW-html-sanitization (2026-05-21) — sanitize TipTap HTML před uložením.
    // Týká se page.content i obsahu jednotlivých sekcí (section.content).
    const safeContent = sanitizeRichText(dto.content ?? '');
    const safeSections = (dto.sections ?? []).map((sec) => ({
      ...sec,
      content: sanitizeRichText(sec.content ?? ''),
    }));
    const plainText = this.tipTapExtractor.extract(safeContent);
    // Krok 9.1 — PostavaHrace/NPC pole; pro ostatní typy ignorujeme i kdyby
    // klient poslal (vědomé zúžení, aby wiki stránky nesly character data).
    const isPersona = dto.type === 'Postava hráče' || dto.type === 'NPC';
    const safePrivateContent = isPersona
      ? sanitizeRichText(dto.privateContent ?? '')
      : undefined;

    // Krok 9.1 / Spec 9.2 — pro persona i Lokace typ auto-vytvoř Character
    // entity (subdoc kontejner). Persona = plné subdocs (diary/calendar/
    // finance/inventory/notes), Lokace = jen calendar.
    // Klient může předat existující characterRef (migrace už proběhla),
    // pak novou nevytváříme.
    const isLocation = dto.type === 'Lokace';
    const needsCharacter = isPersona || isLocation;
    let characterRef = needsCharacter ? dto.characterRef : undefined;
    if (needsCharacter && !characterRef) {
      const character = await this.charactersService.create(
        {
          slug,
          name: dto.title,
          isNpc: dto.type === 'NPC',
          userId: dto.type === 'Postava hráče' ? dto.ownerUserId : undefined,
          // Spec 9.2 — Lokace dostane jen calendar subdoc.
          kind: isLocation ? 'location' : 'persona',
        },
        worldId,
      );
      characterRef = { characterId: character.id };
    }

    const savedPage = await this.pagesRepo.save({
      ...dto,
      slug,
      worldId,
      content: safeContent,
      plainText,
      sections: safeSections,
      table: sanitizeTable(dto.table),
      galleryImages: dto.galleryImages ?? [],
      videos: dto.videos ?? [],
      menu: (dto.menu ?? []).map((m) => ({ ...m, order: m.order ?? 0 })),
      isWoodWide: dto.isWoodWide ?? false,
      accessRequirements: dto.accessRequirements ?? [],
      order: dto.order ?? 0,
      privateContent: isPersona ? safePrivateContent : undefined,
      privateInfoBlocks: isPersona ? (dto.privateInfoBlocks ?? []) : undefined,
      ownerUserId: dto.type === 'Postava hráče' ? dto.ownerUserId : undefined,
      characterRef,
    });
    void this.searchCoordinator
      ?.addPageToIndex(savedPage)
      .catch((err: unknown) =>
        this.logger.warn(`addPageToIndex selhal pro ${savedPage.slug}`, err),
      );
    return savedPage;
  }

  async update(
    id: string,
    worldId: string,
    dto: UpdatePageDto,
    requester: PagesRequester,
  ): Promise<Page> {
    await this.assertCanWrite(worldId, requester);
    const page = await this.pagesRepo.findById(id);
    if (!page)
      throw new NotFoundException({
        code: 'PAGE_NOT_FOUND',
        message: 'Stránka nenalezena',
      });
    if (page.worldId !== worldId)
      throw new ForbiddenException({
        code: 'PAGE_WORLD_MISMATCH',
        message: 'Stránka nepatří do tohoto světa',
      });
    // 7.2k — optimistic concurrency check. Pokud klient poslal `expectedUpdatedAt`
    // a stránka byla mezitím změněna (někým jiným nebo jiným tabem), vrátíme 409.
    if (dto.expectedUpdatedAt) {
      const serverUpdatedAt = page.updatedAt
        ? new Date(page.updatedAt).toISOString()
        : null;
      if (serverUpdatedAt && serverUpdatedAt !== dto.expectedUpdatedAt) {
        throw new ConflictException({
          code: 'PAGE_CONFLICT',
          message:
            'Stránka byla mezitím upravena. Načti aktuální verzi nebo přepiš.',
          serverUpdatedAt,
        });
      }
    }
    // D-NEW-html-sanitization (2026-05-21) — sanitize content + sections.content.
    const extra: Partial<Page> = {};
    let safeContent: string | undefined;
    if (dto.content !== undefined) {
      safeContent = sanitizeRichText(dto.content);
      extra.plainText = this.tipTapExtractor.extract(safeContent);
    }
    const safeSections = dto.sections?.map((sec) => ({
      ...sec,
      content: sanitizeRichText(sec.content ?? ''),
    }));
    // 7.2k — expectedUpdatedAt je jen pro concurrency check, ne pro persist.
    const { expectedUpdatedAt: _ignored, ...persistDto } = dto;
    // Krok 9.1 — sanitize privateContent (jen je-li type persona). Resolved
    // type prefer DTO, fallback na current page.type (PATCH bez `type`).
    const resolvedType = persistDto.type ?? page.type;
    const isPersona =
      resolvedType === 'Postava hráče' || resolvedType === 'NPC';
    const safePrivateContent =
      persistDto.privateContent !== undefined && isPersona
        ? sanitizeRichText(persistDto.privateContent)
        : undefined;

    // Krok 9.1 / Spec 9.2 — transition wiki→persona/Lokace vytvoří Character
    // entity, pokud Page ještě characterRef nemá (typicky migrace
    // Ostatní→PC nebo Ostatní→Lokace v editoru).
    const isLocationUpd = resolvedType === 'Lokace';
    const needsCharacterUpd = isPersona || isLocationUpd;
    let extraCharacterRef: { characterId: string } | undefined;
    if (needsCharacterUpd && !page.characterRef && !persistDto.characterRef) {
      const character = await this.charactersService.create(
        {
          slug: page.slug,
          name: persistDto.title ?? page.title,
          isNpc: resolvedType === 'NPC',
          userId:
            resolvedType === 'Postava hráče'
              ? (persistDto.ownerUserId ?? page.ownerUserId)
              : undefined,
          kind: isLocationUpd ? 'location' : 'persona',
        },
        worldId,
      );
      extraCharacterRef = { characterId: character.id };
    } else if (page.characterRef && persistDto.type) {
      // 10.2c-edit-7 — pokud user změnil typ Page (Lokace ↔ Postava hráče/NPC),
      // přepiš Character.kind. Bez tohoto sync Character drží zaostalý `kind`
      // a PC paleta na taktické mapě postavu odmítá (kind='location') nebo
      // zahrnuje Lokaci (kind='persona').
      const expectedKind: 'persona' | 'location' = isLocationUpd
        ? 'location'
        : 'persona';
      await this.charactersService.syncKind(
        page.characterRef.characterId,
        expectedKind,
      );
    }
    const updated = await this.pagesRepo.update(id, {
      ...persistDto,
      ...(safeContent !== undefined && { content: safeContent }),
      ...(safeSections && { sections: safeSections }),
      ...(persistDto.table && { table: sanitizeTable(persistDto.table) }),
      ...extra,
      menu: persistDto.menu?.map((m) => ({ ...m, order: m.order ?? 0 })),
      ...(safePrivateContent !== undefined && {
        privateContent: safePrivateContent,
      }),
      ...(extraCharacterRef && { characterRef: extraCharacterRef }),
      ...(!isPersona && {
        // type přepnut z persona na wiki/Lokace — vyčistit persona pole.
        privateContent: undefined,
        privateInfoBlocks: undefined,
        ownerUserId: undefined,
      }),
      // Spec 9.2 — characterRef se maže jen pokud nový type nepotřebuje
      // Character entity (tj. ani persona, ani Lokace).
      ...(!needsCharacterUpd && { characterRef: undefined }),
    });
    void this.searchCoordinator
      ?.updatePageInIndex(updated!)
      .catch((err: unknown) =>
        this.logger.warn(`updatePageInIndex selhal pro id=${id}`, err),
      );
    return updated!;
  }

  async delete(
    id: string,
    worldId: string,
    requester: PagesRequester,
  ): Promise<void> {
    await this.assertCanWrite(worldId, requester);
    const page = await this.pagesRepo.findById(id);
    if (!page)
      throw new NotFoundException({
        code: 'PAGE_NOT_FOUND',
        message: 'Stránka nenalezena',
      });
    if (page.worldId !== worldId)
      throw new ForbiddenException({
        code: 'PAGE_WORLD_MISMATCH',
        message: 'Stránka nepatří do tohoto světa',
      });
    await this.pagesRepo.delete(id);
    void this.searchCoordinator
      ?.deletePageFromIndex(page.slug)
      .catch((err: unknown) =>
        this.logger.warn(`deletePageFromIndex selhal pro ${page.slug}`, err),
      );
  }

  async findDirectory(worldId: string, types?: string[], userId?: string) {
    const entries = await this.pagesRepo.findDirectory(worldId, types);
    // D-062c — per-entry shieldedBy pro stub karty v listings. Membership +
    // akjSettings načteme JEDNOU (ne N+1 per stránka), a jen když je vůbec nějaká
    // stránka chráněná. Raw accessRequirements NEvracíme na FE (privacy — UserId).
    const anyProtected = entries.some(
      (e) => (e.accessRequirements?.length ?? 0) > 0,
    );
    const membership =
      anyProtected && userId
        ? await this.membershipRepo.findByUserAndWorld(userId, worldId)
        : null;
    const needsAkjTypes =
      anyProtected &&
      entries.some((e) =>
        e.accessRequirements?.some((r) => r.type === 'AKJType'),
      );
    const akjSettings = needsAkjTypes
      ? ((await this.settingsRepo.findByWorldId(worldId))?.akjTypes ?? [])
      : [];
    return entries.map(({ accessRequirements, ...rest }) => ({
      ...rest,
      shieldedBy: anyProtected
        ? this.shieldedFromRequirements(
            accessRequirements,
            membership,
            akjSettings,
            userId ?? null,
          )
        : undefined,
    }));
  }

  async findAllSlugs(worldId: string): Promise<string[]> {
    return this.pagesRepo.findAllSlugs(worldId);
  }

  async findRandom(worldId: string, count: number): Promise<Page[]> {
    return this.pagesRepo.findRandom(worldId, Math.max(1, Math.min(count, 50)));
  }

  async findMeta(
    slug: string,
    worldId: string,
    userId?: string | null,
  ): Promise<{
    isWoodWide: boolean;
    shieldedBy?: ShieldedRequirement[];
  }> {
    const page = await this.pagesRepo.findBySlugAndWorld(slug, worldId);
    if (!page)
      throw new NotFoundException({
        code: 'PAGE_NOT_FOUND',
        message: 'Stránka nenalezena',
      });
    const shieldedBy = await this.computeShieldedBy(
      page,
      userId ?? null,
      worldId,
    );
    return {
      isWoodWide: page.isWoodWide ?? false,
      ...(shieldedBy ? { shieldedBy } : {}),
    };
  }

  /**
   * D-062a — vrátí seznam nesplněných accessRequirements pro daného usera.
   * `UserId` requirements se vynechávají (privacy).
   * `undefined` = stránka nemá restrikce nebo user má plný přístup.
   */
  private async computeShieldedBy(
    page: Page,
    userId: string | null,
    worldId: string,
  ): Promise<ShieldedRequirement[] | undefined> {
    if (!page.accessRequirements || page.accessRequirements.length === 0) {
      return undefined;
    }
    const membership = userId
      ? await this.membershipRepo.findByUserAndWorld(userId, worldId)
      : null;
    const needsAkjTypes = page.accessRequirements.some(
      (r) => r.type === 'AKJType',
    );
    const akjSettings = needsAkjTypes
      ? ((await this.settingsRepo.findByWorldId(worldId))?.akjTypes ?? [])
      : [];
    return this.shieldedFromRequirements(
      page.accessRequirements,
      membership,
      akjSettings,
      userId,
    );
  }

  /**
   * Čistý (DB-free) výpočet `shieldedBy` z už-načteného membershipu + akjSettings.
   * OR semantika: stačí splnit JEDEN requirement → přístup (undefined). Volá se
   * jak per-page (computeShieldedBy), tak per-entry v `findDirectory` (kde se
   * membership + akjSettings načtou JEDNOU, ne N+1 per stránka).
   */
  private shieldedFromRequirements(
    accessRequirements: AccessRequirement[] | undefined,
    membership: { akj?: number; role?: number } | null,
    akjSettings: { key: string; name: string; level: number }[],
    userId: string | null,
  ): ShieldedRequirement[] | undefined {
    if (!accessRequirements || accessRequirements.length === 0) {
      return undefined;
    }
    let granted = false;
    const out: ShieldedRequirement[] = [];
    for (const req of accessRequirements) {
      if (req.type === 'UserId') {
        if (userId && req.value === userId) granted = true;
        // UserId nikdy nepřidáváme do shieldedBy (privacy)
        continue;
      }
      if (req.type === 'AKJ') {
        const need = parseInt(req.value, 10);
        const has = membership?.akj ?? -1;
        if (has >= need) {
          granted = true;
        } else {
          out.push({ type: 'AKJ', level: need });
        }
        continue;
      }
      if (req.type === 'Role') {
        const need = parseInt(req.value, 10);
        // Cast přes Number — `membership.role` je WorldRole enum, `need` je raw int;
        // bez castu eslint flags @typescript-eslint/no-unsafe-enum-comparison.
        const has: number = membership?.role ?? -1;
        if (has >= need) {
          granted = true;
        } else {
          out.push({
            type: 'Role',
            level: need,
            roleLabel: this.roleLabel(need),
          });
        }
        continue;
      }
      if (req.type === 'AKJType') {
        const def = akjSettings.find((g) => g.key === req.value);
        const need = def?.level ?? 0;
        const has = membership?.akj ?? -1;
        if (def && has >= need) {
          granted = true;
        } else {
          out.push({
            type: 'AKJType',
            level: def?.level,
            akjKey: req.value,
            akjLabel: def?.name ?? req.value,
          });
        }
      }
    }
    if (granted) return undefined;
    return out.length > 0 ? out : undefined;
  }

  private roleLabel(role: number): string {
    // Mirror WorldRole enum (0..5). Bez import enum-u držíme jednoduchou mapu.
    const labels: Record<number, string> = {
      0: 'Žadatel',
      1: 'Čtenář',
      2: 'Hráč',
      3: 'Korektor',
      4: 'Pomocný PJ',
      5: 'Pán jeskyně',
    };
    return labels[role] ?? `Role ${role}`;
  }

  async addFavorite(worldId: string, slug: string): Promise<void> {
    const exists = await this.pagesRepo.existsBySlugAndWorld(slug, worldId);
    if (!exists)
      throw new NotFoundException({
        code: 'PAGE_NOT_FOUND',
        message: 'Stránka nenalezena',
      });
    await this.worldsRepo.addFavoriteSlug(worldId, slug);
  }

  async removeFavorite(worldId: string, slug: string): Promise<void> {
    await this.worldsRepo.removeFavoriteSlug(worldId, slug);
  }

  /**
   * 7.1l — Backlinks pro „Odkazuje sem" panel ve vieweru. Filtruje stránky,
   * ke kterým má requester přístup (zbytek vyloučí silent — neukazujeme
   * existenci utajených stránek). Cílová stránka samotná musí existovat,
   * jinak 404.
   */
  async findBacklinks(
    targetSlug: string,
    worldId: string,
    userId: string,
  ): Promise<Pick<Page, 'slug' | 'title' | 'type'>[]> {
    const target = await this.pagesRepo.findBySlugAndWorld(targetSlug, worldId);
    if (!target)
      throw new NotFoundException({
        code: 'PAGE_NOT_FOUND',
        message: 'Stránka nenalezena',
      });
    // Cílová stránka musí být přístupná žadateli — jinak by jsme prozradili
    // existenci utajené stránky přes backlinks listing.
    await this.assertAccess(target, userId, worldId);

    const candidates = await this.pagesRepo.findBacklinksToSlug(
      worldId,
      targetSlug,
    );
    // Filtr — pouze backlinky, ke kterým má requester přístup (vyloučíme silent)
    const accessible: Pick<Page, 'slug' | 'title' | 'type'>[] = [];
    for (const candidate of candidates) {
      const full = await this.pagesRepo.findBySlugAndWorld(
        candidate.slug,
        worldId,
      );
      if (!full) continue;
      try {
        await this.assertAccess(full, userId, worldId);
        accessible.push(candidate);
      } catch {
        // silent skip
      }
    }
    return accessible;
  }

  async findFavorites(worldId: string): Promise<Page[]> {
    const world = await this.worldsRepo.findById(worldId);
    if (!world)
      throw new NotFoundException({
        code: 'WORLD_NOT_FOUND',
        message: 'Svět nenalezen',
      });
    return this.pagesRepo.findBySlugs(world.favoritePageSlugs, worldId);
  }

  private async assertAccess(
    page: Page,
    userId: string,
    worldId: string,
  ): Promise<void> {
    if (!page.accessRequirements || page.accessRequirements.length === 0)
      return;
    const membership = await this.membershipRepo.findByUserAndWorld(
      userId,
      worldId,
    );
    for (const req of page.accessRequirements) {
      if (req.type === 'UserId' && req.value === userId) return;
      if (
        req.type === 'AKJ' &&
        membership &&
        membership.akj >= parseInt(req.value, 10)
      )
        return;
      if (
        req.type === 'Role' &&
        membership &&
        // eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison
        membership.role >= parseInt(req.value, 10)
      )
        return;
      if (req.type === 'AKJType') {
        const settings = await this.settingsRepo.findByWorldId(worldId);
        const akjTypes = settings?.akjTypes ?? [];
        const group = akjTypes.find((g) => g.key === req.value);
        if (group && membership && membership.akj >= group.level) return;
      }
    }
    throw new ForbiddenException({
      code: 'PAGE_ACCESS_DENIED',
      message: 'Přístup odepřen',
    });
  }

  /**
   * Krok 9.1 — filtr privateContent + privateInfoBlocks pro non-persona typy
   * (no-op) a pro PostavaHrace/NPC: vidí jen PJ+ nebo vlastník postavy
   * (ownerUserId). Ostatním smaže pole z response.
   */
  private async filterPrivateForViewer(
    page: Page,
    userId: string,
    worldId: string,
  ): Promise<Page> {
    const isPersona = page.type === 'Postava hráče' || page.type === 'NPC';
    if (!isPersona) return page;
    const isOwner = !!page.ownerUserId && page.ownerUserId === userId;
    if (isOwner) return page;
    const membership = await this.membershipRepo.findByUserAndWorld(
      userId,
      worldId,
    );
    if (membership && membership.role >= WorldRole.PomocnyPJ) return page;
    // Neoprávněný — vrať bez private polí.
    const { privateContent: _pc, privateInfoBlocks: _pb, ...rest } = page;
    return rest;
  }

  /**
   * Write access pro stránky: Admin/Superadmin shortcut, jinak WorldRole >= PomocnyPJ.
   * Neexistující svět = 404 (per .claude/rules/auth-leak-policy.md — auth-required pattern).
   * Vlastník světa není automaticky autorizován; rozhoduje membership.
   */
  private async assertCanWrite(
    worldId: string,
    requester: PagesRequester,
  ): Promise<void> {
    if (requester.role <= UserRole.Admin) return;
    const world = await this.worldsRepo.findById(worldId);
    if (!world)
      throw new NotFoundException({
        code: 'WORLD_NOT_FOUND',
        message: 'Svět nenalezen',
      });
    const membership = await this.membershipRepo.findByUserAndWorld(
      requester.id,
      worldId,
    );
    if (!membership || membership.role < WorldRole.PomocnyPJ) {
      throw new ForbiddenException({
        code: 'PAGE_FORBIDDEN',
        message: 'Nedostatečná oprávnění',
      });
    }
  }
}
