import {
  Injectable,
  Inject,
  Optional,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { sanitizeRichText } from '../../common/utils/sanitize-rich-text';
import { SearchCoordinator } from '../search/search.coordinator';
import { CharactersService } from '../characters/characters.service';
import type { IPagesRepository } from './interfaces/pages-repository.interface';
import type { IWorldMembershipRepository } from '../worlds/interfaces/world-membership-repository.interface';
import type { IWorldsRepository } from '../worlds/interfaces/worlds-repository.interface';
import type { IWorldSettingsRepository } from '../worlds/interfaces/world-settings-repository.interface';
import type {
  Page,
  AkjTab,
  ShieldedRequirement,
  AccessRequirement,
} from './interfaces/page.interface';
import type { CreatePageDto } from './dto/create-page.dto';
import type { UpdatePageDto } from './dto/update-page.dto';
import { TipTapExtractor } from './tiptap-extractor.service';
import { UserRole } from '../users/interfaces/user.interface';
import {
  WorldRole,
  type WorldMembership,
} from '../worlds/interfaces/world-membership.interface';
import type { AkjType } from '../worlds/interfaces/world-settings.interface';

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

/**
 * AKJ záložky — sanitizuje HTML uvnitř `contentOverride` (content, table,
 * sections, infoBlocks value) stejným allowlistem jako základní obsah stránky.
 */
function sanitizeAkjTabs(
  tabs: CreatePageDto['akjTabs'],
): CreatePageDto['akjTabs'] {
  if (!tabs) return tabs;
  return tabs.map((tab) => {
    if (!tab.contentOverride) return tab;
    const co = tab.contentOverride;
    return {
      ...tab,
      contentOverride: {
        ...co,
        ...(co.content !== undefined && {
          content: sanitizeRichText(co.content),
        }),
        ...(co.table && { table: sanitizeTable(co.table) }),
      },
    };
  });
}

/**
 * „In-fiction" AKJ záložka, kterou hráč bez přístupu vidí ZAMČENOU (ne skrytou):
 * má aspoň jednu clearance podmínku (AKJ/AKJType) a žádnou Role. Role záložky
 * („PJ informace") a prázdné / jen-jmenovité („Soukromé") zůstávají skryté.
 * Viz spec-akj-locked-tabs-visible.md.
 */
function isBroadcastableAkjTab(tab: AkjTab): boolean {
  const hasClearance = tab.access.some(
    (r) => r.type === 'AKJ' || r.type === 'AKJType',
  );
  const hasRole = tab.access.some((r) => r.type === 'Role');
  return hasClearance && !hasRole;
}

/**
 * Zamčená varianta záložky pro viewera bez přístupu — pošle se jen jméno +
 * úroveň (AKJ/AKJType reqs), BEZ obsahu a bez jmenovitých klíčů (UserId), aby
 * neuniklo, co je uvnitř ani komu patří.
 */
function lockedAkjTab(tab: AkjTab): AkjTab {
  return {
    id: tab.id,
    name: tab.name,
    order: tab.order,
    access: tab.access.filter((r) => r.type === 'AKJ' || r.type === 'AKJType'),
    locked: true,
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
    // CD-01/CD-08 (cascade-delete audit) — emit `page.deleted` pro úklid
    // Cloudinary blobů a oblíbených (favoritePageSlugs) po smazání stránky.
    private readonly eventEmitter: EventEmitter2,
    @Optional()
    @Inject(SearchCoordinator)
    private readonly searchCoordinator?: SearchCoordinator,
  ) {}

  async findByWorld(
    worldId: string,
    type?: string,
    userId?: string,
    platformRole?: UserRole,
  ): Promise<Page[]> {
    const pages = await this.pagesRepo.findByWorld(worldId, type);
    // Bez userId (legacy callers) nefiltruji. Jinak: R-09 — page-level access
    // filtr (dřív CHYBĚL → listing vracel plný obsah page-level chráněných
    // stránek každému členu) + odřízni AKJ chráněné záložky bez přístupu.
    if (!userId) return pages;
    const filtered: Page[] = [];
    for (const page of pages) {
      try {
        await this.assertAccess(page, userId, worldId, platformRole);
      } catch {
        continue; // bez page-level přístupu — stránka se v listingu vynechá
      }
      filtered.push(
        await this.filterAkjTabsForViewer(page, userId, worldId, platformRole),
      );
    }
    return filtered;
  }

  async findBySlug(
    slug: string,
    worldId: string,
    userId: string,
    platformRole?: UserRole,
  ): Promise<Page> {
    const page = await this.pagesRepo.findBySlugAndWorld(slug, worldId);
    if (!page)
      throw new NotFoundException({
        code: 'PAGE_NOT_FOUND',
        message: 'Stránka nenalezena',
      });
    await this.assertAccess(page, userId, worldId, platformRole);
    // AKJ chráněné záložky — odřízni ty, na které viewer nemá přístup.
    return this.filterAkjTabsForViewer(page, userId, worldId, platformRole);
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
      ownerUserId: dto.type === 'Postava hráče' ? dto.ownerUserId : undefined,
      characterRef,
      akjTabs: sanitizeAkjTabs(dto.akjTabs) ?? [],
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
    // Resolved type prefer DTO, fallback na current page.type (PATCH bez `type`).
    const resolvedType = persistDto.type ?? page.type;
    const isPersona =
      resolvedType === 'Postava hráče' || resolvedType === 'NPC';

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
      // akjTabs jsou v ...persistDto raw — přepiš sanitizovanou verzí.
      // Prázdné pole [] (smazání všech záložek) projde (je truthy).
      ...(persistDto.akjTabs && {
        akjTabs: sanitizeAkjTabs(persistDto.akjTabs),
      }),
      ...extra,
      menu: persistDto.menu?.map((m) => ({ ...m, order: m.order ?? 0 })),
      ...(extraCharacterRef && { characterRef: extraCharacterRef }),
      ...(!isPersona && {
        // type přepnut z persona na wiki/Lokace — vyčistit owner.
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
    // CD-01/CD-08 — úklid Cloudinary blobů (imageUrl + galerie) a oblíbených.
    this.eventEmitter.emit('page.deleted', {
      worldId,
      slug: page.slug,
      imageUrl: page.imageUrl ?? null,
      galleryUrls: (page.galleryImages ?? []).map((g) => g.url),
    });
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

  async findAllSlugs(
    worldId: string,
    requester: PagesRequester,
  ): Promise<string[]> {
    // N-37 — slug list je editor pomůcka (WikilinkSuggestion); bez gatingu
    // leakoval existenci/slugy AKJ-chráněných stránek všem přihlášeným.
    // PomocnyPJ+ (autorské role) nebo platform Admin+.
    if (requester.role > UserRole.Admin) {
      const m = await this.membershipRepo.findByUserAndWorld(
        requester.id,
        worldId,
      );
      if (!m || m.role < WorldRole.PomocnyPJ)
        throw new ForbiddenException({
          code: 'FORBIDDEN',
          message: 'Slugy stránek smí číst jen PomocnyPJ+',
        });
    }
    return this.pagesRepo.findAllSlugs(worldId);
  }

  /**
   * N-35 — slugy stránek, na které má requester PAGE-LEVEL přístup. Search
   * filtruje výsledky tímto setem, aby neleakoval názvy AKJ/access-chráněných
   * stránek hráčům bez přístupu. Reuse `assertAccess` (admin/PomocnyPJ bypass,
   * AKJ, settings) per stránka — pro search (desítky stránek) je cost zanedbatelný.
   */
  async findVisibleSlugs(
    worldId: string,
    requester: PagesRequester | null,
  ): Promise<Set<string>> {
    const pages = await this.pagesRepo.findByWorld(worldId);
    const visible = new Set<string>();
    for (const page of pages) {
      try {
        await this.assertAccess(
          page,
          requester?.id ?? '',
          worldId,
          requester?.role,
        );
        visible.add(page.slug);
      } catch {
        // bez přístupu — stránka se ze search výsledků vynechá
      }
    }
    return visible;
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
    platformRole?: UserRole,
  ): Promise<Pick<Page, 'slug' | 'title' | 'type'>[]> {
    const target = await this.pagesRepo.findBySlugAndWorld(targetSlug, worldId);
    if (!target)
      throw new NotFoundException({
        code: 'PAGE_NOT_FOUND',
        message: 'Stránka nenalezena',
      });
    // Cílová stránka musí být přístupná žadateli — jinak by jsme prozradili
    // existenci utajené stránky přes backlinks listing.
    await this.assertAccess(target, userId, worldId, platformRole);

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
        await this.assertAccess(full, userId, worldId, platformRole);
        accessible.push(candidate);
      } catch {
        // silent skip
      }
    }
    return accessible;
  }

  /**
   * Jádro AKJ vyhodnocení: splní `reqs` aspoň jednu podmínku (OR)? Synchronní —
   * `akjTypes` se předávají, aby šlo levně vyhodnotit mnoho záložek bez
   * opakovaného settings lookupu. Sdílené mezi `assertAccess` (page-level) a
   * `filterAkjTabsForViewer` (per-tab).
   */
  private passesAccess(
    reqs: AccessRequirement[],
    userId: string,
    membership: WorldMembership | null,
    akjTypes: AkjType[],
  ): boolean {
    for (const req of reqs) {
      if (req.type === 'UserId' && req.value === userId) return true;
      if (
        req.type === 'AKJ' &&
        membership &&
        membership.akj >= parseInt(req.value, 10)
      )
        return true;
      if (
        req.type === 'Role' &&
        membership &&
        // eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison
        membership.role >= parseInt(req.value, 10)
      )
        return true;
      if (req.type === 'AKJType') {
        const group = akjTypes.find((g) => g.key === req.value);
        if (group && membership && membership.akj >= group.level) return true;
      }
    }
    return false;
  }

  private async assertAccess(
    page: Page,
    userId: string,
    worldId: string,
    platformRole?: UserRole,
  ): Promise<void> {
    if (!page.accessRequirements || page.accessRequirements.length === 0)
      return;
    // AKJ skrývá obsah jen před hráči. PomocnyPJ+ (autorské role) a platform
    // Admin+ ho obcházejí — jinak by se PJ zamkl ze svého vlastního obsahu.
    if (platformRole !== undefined && platformRole <= UserRole.Admin) return;
    const membership = await this.membershipRepo.findByUserAndWorld(
      userId,
      worldId,
    );
    if (membership && membership.role >= WorldRole.PomocnyPJ) return;
    const needsAkjTypes = page.accessRequirements.some(
      (r) => r.type === 'AKJType',
    );
    const akjTypes = needsAkjTypes
      ? ((await this.settingsRepo.findByWorldId(worldId))?.akjTypes ?? [])
      : [];
    if (
      this.passesAccess(page.accessRequirements, userId, membership, akjTypes)
    )
      return;
    throw new ForbiddenException({
      code: 'PAGE_ACCESS_DENIED',
      message: 'Přístup odepřen',
    });
  }

  /**
   * AKJ chráněné záložky — uprav `akjTabs` pro daného viewera. PJ a platform
   * Admin+ vidí všechny odemčené; PomocnyPJ NEMÁ auto-bypass (jen co mu PJ
   * grantoval přes `tab.access`) — viz spec-akj-protected-tabs.
   *
   * Per spec-akj-locked-tabs-visible (2026-06-11): nedostupná záložka se už
   * NEmaže paušálně. „In-fiction" clearance záložka (viz isBroadcastableAkjTab)
   * se pošle ZAMČENÁ (jméno + úroveň, bez obsahu) → hráč vidí zámek a může na
   * přístup pracovat. Role záložky („PJ informace") a soukromé zůstávají skryté.
   */
  private async filterAkjTabsForViewer(
    page: Page,
    userId: string,
    worldId: string,
    platformRole?: UserRole,
  ): Promise<Page> {
    if (!page.akjTabs || page.akjTabs.length === 0) return page;
    const membership = await this.membershipRepo.findByUserAndWorld(
      userId,
      worldId,
    );
    const seesAll =
      (platformRole !== undefined && platformRole <= UserRole.Admin) ||
      (!!membership && membership.role >= WorldRole.PJ);
    if (seesAll) {
      // PJ/Admin: vše odemčené. Explicitní flag, ať FE nemusí stav dohadovat.
      return {
        ...page,
        akjTabs: page.akjTabs.map((tab) => ({ ...tab, locked: false })),
      };
    }
    const needsAkjTypes = page.akjTabs.some((t) =>
      t.access.some((r) => r.type === 'AKJType'),
    );
    const akjTypes = needsAkjTypes
      ? ((await this.settingsRepo.findByWorldId(worldId))?.akjTypes ?? [])
      : [];
    const result: AkjTab[] = [];
    for (const tab of page.akjTabs) {
      const canSee =
        this.passesAccess(tab.access, userId, membership, akjTypes) ||
        // Vlastník postavy vidí AKJ záložky na své PC, dokud mu PJ právo
        // neodebere (ownerHidden). Mimo PC je ownerUserId undefined → bez efektu.
        (!!page.ownerUserId && page.ownerUserId === userId && !tab.ownerHidden);
      if (canSee) {
        result.push({ ...tab, locked: false });
      } else if (isBroadcastableAkjTab(tab)) {
        result.push(lockedAkjTab(tab));
      }
      // jinak: skryté úplně (PJ informace = Role / Soukromé = prázdné/jen klíč).
    }
    return { ...page, akjTabs: result };
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
