import {
  Injectable,
  Inject,
  Optional,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { logError, logWarn } from '../../common/logging/log-error.util';
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
  PageType,
  AkjTab,
  ShieldedRequirement,
  AccessRequirement,
} from './interfaces/page.interface';
import { PLAYER_PROPOSABLE_PAGE_TYPES } from './interfaces/page.interface';
import type { CreatePageDto } from './dto/create-page.dto';
import type { UpdatePageDto } from './dto/update-page.dto';
import { TipTapExtractor } from './tiptap-extractor.service';
import { UserRole } from '../users/interfaces/user.interface';
import {
  WorldRole,
  type WorldMembership,
} from '../worlds/interfaces/world-membership.interface';
import type { AkjType } from '../worlds/interfaces/world-settings.interface';
import { worldAdminBypass } from '../../common/utils/world-elevation';
// 22.4 — vitrína: brána anonymního čtení (anon = Čtenář, jen zapnutá vitrína).
import { assertShowcaseViewable } from '../../common/utils/showcase';
// B4b — „kdo vidí moderačně skrytý obsah" = generický reviewer set (spec 20B).
import { isContentReviewer } from '../moderation/moderation.constants';
import { assertUnderCreationLimit } from '../../common/limits/creation-limits';

export interface PagesRequester {
  id: string;
  role: UserRole;
  /**
   * World elevation — platform Admin/Superadmin má world bypass JEN pro světy
   * v tomto seznamu (plní JwtAuthGuard). Bez elevace žádný bypass. Viz
   * `worldAdminBypass` / spec-world-admin-elevation.
   */
  elevatedWorldIds?: string[];
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
    // PT-36a — `title` se renderuje přes dangerouslySetInnerHTML (PageSidebar)
    // stejně jako headers/values → stored XSS bez sanitizace. Musí projít
    // stejným allowlistem.
    ...(table.title && { title: sanitizeRichText(table.title) }),
    ...(table.headers && {
      headers: table.headers.map((h) => sanitizeRichText(h)),
    }),
    ...(table.values && {
      values: table.values.map((v) => sanitizeRichText(v)),
    }),
  };
}

// F-RUN-02 (plný audit 2026-06-20) — `customData` (typ Noviny) se renderuje
// přes `dangerouslySetInnerHTML` (NovinyLayout). Bez sanitizace stejná stored-XSS
// třída jako F-02 (timeline). Sanitizujeme každou HTML hodnotu.
/**
 * N-RUN-08-02 (plný audit, styl 36) — **stored XSS přes type-confusion.**
 *
 * Dřív: `typeof value === 'string' ? sanitizeRichText(value) : value` — ne-string
 * hodnota **prošla RAW**. `customData` je sice `Record<string, string>`, jenže to
 * je jen compile-time; DTO má pouhé `@IsObject()`, per-value validace žádná.
 * Autor (PomocnyPJ+) tedy mohl poslat mimo UI `customData: { "Stát": ["<img
 * src=x onerror=…>"] }` → sanitizace se přeskočila → uložilo se raw → FE
 * `NovinyLayout:66` to nasadí do `dangerouslySetInnerHTML` jako
 * `array.toString()` → **XSS u KAŽDÉHO diváka stránky včetně PJ/Admina**
 * (krádež session). Stejná třída jako PT-36a (`table.title`), ale mimo
 * sanitizovanou string-větev — proto to sink-sanitizer audit minul.
 *
 * Teď: **všechno se nejdřív coercne na string a pak sanitizuje** — sanitizace
 * nesmí mít větev, kterou lze obejít volbou typu.
 */
function sanitizeCustomData(
  customData: CreatePageDto['customData'],
): CreatePageDto['customData'] {
  if (!customData) return customData;
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(customData)) {
    out[key] = sanitizeRichText(coerceCustomValue(value));
  }
  return out;
}

/**
 * Bezpečný převod libovolné hodnoty na string pro sanitizaci.
 *
 * `String(value)` samo o sobě NESTAČÍ: objekt s podvrženým prototypem
 * (`{ toString: undefined }`, `Object.create(null)`) hodí
 * `TypeError: Cannot convert object to primitive value` → request spadne na 500.
 * Útočník by tak sice XSS neprotlačil, ale shodil by ukládání stránky. Proto
 * `try/catch` → nekonvertovatelná hodnota se **zahodí** (`''`), nikdy neprojde.
 *
 * `null`/`undefined` → `''` záměrně (ne `'null'`, což by se zobrazilo jako text).
 */
function coerceCustomValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint'
  )
    return String(value);
  // Objekt / pole / symbol — `String(obj)` dá buď '[object Object]' (ztráta
  // dat), nebo TypeError (podvržený prototyp). JSON zachová obsah; cyklický /
  // nekonvertovatelný vstup (JSON hodí nebo vrátí undefined) → zahodit ('').
  try {
    return JSON.stringify(value) ?? '';
  } catch {
    return '';
  }
}

/**
 * AKJ obrázek override — vlastník postavy je méně důvěryhodný než PJ (může
 * záložku editovat inline, spec-akj-owner-editable-content). Povol jen http(s)
 * a relativní URL; `data:` / `javascript:` / `blob:` zahoď (undefined = dědí
 * obrázek základní stránky). Prázdný string ponech (vědomé smazání → dědění).
 */
function sanitizeAkjImageUrl(url: string | undefined): string | undefined {
  if (url === undefined) return undefined;
  const trimmed = url.trim();
  if (trimmed === '') return '';
  return /^(https?:\/\/|\/)/i.test(trimmed) ? trimmed : undefined;
}

/**
 * AKJ záložky — sanitizuje HTML uvnitř `contentOverride` (content, table,
 * sections, infoBlocks value) stejným allowlistem jako základní obsah stránky.
 * `contentOverride.imageUrl` projde URL guardem (viz sanitizeAkjImageUrl).
 */
function sanitizeAkjTabs(
  tabs: CreatePageDto['akjTabs'],
): CreatePageDto['akjTabs'] {
  if (!tabs) return tabs;
  return tabs.map((rawTab) => {
    // `locked` je read-time enrich (server zámek), klient ho posílá zpět —
    // do DB nepatří (GET ho vždy přepočítá). Zahodit před uložením.
    const { locked: _locked, ...tab } = rawTab as typeof rawTab & {
      locked?: boolean;
    };
    if (!tab.contentOverride) return tab;
    const co = tab.contentOverride;
    return {
      ...tab,
      contentOverride: {
        ...co,
        ...(co.imageUrl !== undefined && {
          imageUrl: sanitizeAkjImageUrl(co.imageUrl),
        }),
        ...(co.content !== undefined && {
          content: sanitizeRichText(co.content),
        }),
        ...(co.table && { table: sanitizeTable(co.table) }),
      },
    };
  });
}

/**
 * FIX-21 — statické first-segment world sub-routes z FE `src/app/router.tsx`
 * (`/svet/:worldSlug/<segment>...`), které by page se shodným slugem natrvalo
 * zastínily (route ji přebije dřív, než dorazí k catch-all `:slug` →
 * PageViewerPage). Zdroj pravdy = router `children` pole world layoutu — při
 * přidání nové world sub-route ji přidej i sem.
 */
export const RESERVED_PAGE_SLUGS: ReadonlySet<string> = new Set([
  'chat',
  'novinky',
  'stranky',
  'nova-stranka',
  'edit', // `edit/:slug` (editor)
  'postavy',
  'postava', // `postava/:slug` (legacy redirect)
  'moje-postava',
  'mapa',
  'mapy',
  'takticka-mapa',
  'bestiar',
  'kalendar',
  'timeline',
  'pocasi',
  'akce',
  'pavucina',
  'scenare',
  'obchod',
  'zvuky',
  'prevodnik-men',
  'nastaveni',
  'hraci',
  'pravidla',
  'skupina', // `skupina/:groupKey`
  'denik-pj',
  'admin', // `admin/stranky`, `admin/kalendare`, `admin/headline`
]);

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
    elevatedWorldIds?: string[],
  ): Promise<Page[]> {
    const pages = await this.pagesRepo.findByWorld(worldId, type);
    // Bez userId (legacy callers) nefiltruji. Jinak: R-09 — page-level access
    // filtr (dřív CHYBĚL → listing vracel plný obsah page-level chráněných
    // stránek každému členu) + odřízni AKJ chráněné záložky bez přístupu.
    if (!userId) return pages;
    // R-09b — world-level brána PŘED per-stránka filtrem: nečlen privátního světa
    // sem dřív propadl a viděl všechny nechráněné stránky (cross-tenant leak).
    await this.assertCanViewWorld(
      worldId,
      userId,
      platformRole,
      elevatedWorldIds,
    );
    const filtered: Page[] = [];
    for (const page of pages) {
      try {
        await this.assertAccess(
          page,
          userId,
          worldId,
          platformRole,
          elevatedWorldIds,
        );
      } catch {
        continue; // bez page-level přístupu — stránka se v listingu vynechá
      }
      filtered.push(
        await this.filterAkjTabsForViewer(
          page,
          userId,
          worldId,
          platformRole,
          elevatedWorldIds,
        ),
      );
    }
    return filtered;
  }

  async findBySlug(
    slug: string,
    worldId: string,
    userId: string | undefined,
    platformRole?: UserRole,
    elevatedWorldIds?: string[],
  ): Promise<Page> {
    if (userId === undefined) {
      // 22.4 vitrína — anonym čte obsah stránky JEN přes zapnuté veřejné
      // nahlížení (403 i pro neexistující svět = anti-enumeration).
      assertShowcaseViewable(await this.worldsRepo.findById(worldId));
    } else {
      // R-09b — world-level brána před čtením stránky (nečlen privátního světa).
      await this.assertCanViewWorld(
        worldId,
        userId,
        platformRole,
        elevatedWorldIds,
      );
    }
    const page = await this.pagesRepo.findBySlugAndWorld(slug, worldId);
    if (!page)
      throw new NotFoundException({
        code: 'PAGE_NOT_FOUND',
        message: 'Stránka nenalezena',
      });
    await this.assertAccess(
      page,
      userId,
      worldId,
      platformRole,
      elevatedWorldIds,
    );
    // AKJ chráněné záložky — odřízni ty, na které viewer nemá přístup.
    return this.filterAkjTabsForViewer(
      page,
      userId,
      worldId,
      platformRole,
      elevatedWorldIds,
    );
  }

  async create(
    dto: CreatePageDto,
    worldId: string,
    requester: PagesRequester,
  ): Promise<Page> {
    // 15.11 — moderátor tvoří rovnou (approved); hráč (Hráč+) navrhující
    // whitelist typ dostane pending (owner=autor). Jinak 403 (jako assertCanWrite).
    const createMode = await this.resolveCreateMode(
      worldId,
      requester,
      dto.type,
    );
    // D-SEC-GAP-2026-07-11 — anti-abuse creation-flood: kumulativní strop
    // stránek per svět (Pages+Characters sjednoceny → jeden count zde; přímou
    // characters route jistí existující WORLD_CHARACTER_QUOTA v characters.service).
    assertUnderCreationLimit(
      await this.pagesRepo.countByWorld(worldId),
      'MAX_PAGES_PER_WORLD',
      'stránek ve světě',
    );
    // FIX-21 — dřív reject (409 PAGE_SLUG_TAKEN) na kolizi. Uživatel chce
    // dosažitelnou stránku, ne chybu → auto-suffix (`mapa` → `mapa-2` ...),
    // dokud slug není volný ANI rezervovaný world route (RESERVED_PAGE_SLUGS).
    // Jméno stránky (title) zůstává, mění se jen skrytý slug.
    const slug = await this.ensureAvailableSlug(
      dto.slug.toLowerCase(),
      worldId,
    );
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
    // DI-04 (db-integrity audit) — sleduj, zda jsme Character vytvořili TEĎ
    // (kvůli rollbacku při selhání page save; child se tvoří dřív než rodič).
    let createdCharacterSlug: string | null = null;
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
      createdCharacterSlug = slug;
    }

    let savedPage: Page;
    try {
      savedPage = await this.pagesRepo.save({
        ...dto,
        slug,
        worldId,
        content: safeContent,
        plainText,
        sections: safeSections,
        table: sanitizeTable(dto.table),
        // 17.7 — familyTree jen pro typ Rodokmen (nový strom vždy dostane objekt,
        // i prázdný → odliší se od legacy 'Rodokmen' bez familyTree = Zoom).
        familyTree:
          dto.type === 'Rodokmen'
            ? (dto.familyTree ?? { people: [], unions: [] })
            : undefined,
        galleryImages: dto.galleryImages ?? [],
        videos: dto.videos ?? [],
        menu: (dto.menu ?? []).map((m) => ({ ...m, order: m.order ?? 0 })),
        isWoodWide: dto.isWoodWide ?? false,
        accessRequirements: dto.accessRequirements ?? [],
        order: dto.order ?? 0,
        ownerUserId: dto.type === 'Postava hráče' ? dto.ownerUserId : undefined,
        // 15.11 — pending návrh hráče (jinak 'approved'); proposedBy = autor.
        pageStatus: createMode.pageStatus,
        proposedBy: createMode.proposedBy,
        characterRef,
        akjTabs: sanitizeAkjTabs(dto.akjTabs) ?? [],
        ...(dto.customData && {
          customData: sanitizeCustomData(dto.customData),
        }),
      });
      // RC-D2 — svět se mohl soft-smazat v okně mezi `assertCanWrite` a `save`
      // → phantom stránka v mrtvém světě. Re-ověř a ukliď (vzor RC-D3/D6
      // re-check po zápisu + rollback). Hodí stejný NotFoundException jako
      // selhání save níže → rollback nově vytvořené postavy proběhne v catch.
      if (!(await this.isWorldActive(worldId))) {
        await this.pagesRepo.delete(savedPage.id).catch(() => undefined);
        throw new NotFoundException({
          code: 'WORLD_NOT_FOUND',
          message: 'Svět byl mezitím smazán',
        });
      }
    } catch (err) {
      // DI-04 — page save selhal PO vytvoření Character → postava + subdocs by
      // zůstaly osiřelé a retry by narazil na {worldId,slug} unique. Rollback
      // nově vytvořené postavy (character.deleted cascade uklidí subdocs).
      if (createdCharacterSlug) {
        try {
          await this.charactersService.delete(createdCharacterSlug, worldId);
        } catch (rollbackErr) {
          logError(
            this.logger,
            `DI-04 rollback postavy selhal (${createdCharacterSlug})`,
            rollbackErr,
          );
        }
      }
      throw err;
    }
    // 15.11 — pending návrh se do search NEindexuje (jinak leak titulu/obsahu
    // přes vyhledávání). Indexuje se až při schválení (approveProposal).
    if (createMode.pageStatus !== 'pending') {
      void this.searchCoordinator
        ?.addPageToIndex(savedPage)
        .catch((err: unknown) =>
          logWarn(
            this.logger,
            `addPageToIndex selhal pro ${savedPage.slug}`,
            err,
          ),
        );
    } else {
      // 15.11 — nový návrh → signál PJ frontě „ke zpracování" (realtime badge).
      this.eventEmitter.emit('world.page-review.changed', { worldId });
    }
    return savedPage;
  }

  /**
   * FIX-21 — vrátí `base`, pokud je volný (ani rezervovaný world route, ani
   * obsazený jinou stránkou), jinak `base-2`, `base-3`, ... až do prvního
   * volného. Cap na 500 pokusů jako pojistka proti nekonečné smyčce (extrémně
   * nepravděpodobné v praxi) — pak radši 409 než zaseknutý request.
   *
   * D-SEC-GAP (slug kolize diakritiky) — kontroluje i `characters` kolekci:
   * FE slugify strhává diakritiku („Šíp" i „Sip" → `sip`), persona/Lokace
   * stránka pak tvoří Character se STEJNÝM slugem ({worldId, slug} unique).
   * Bez tohoto checku by charactersService.create hodil 409
   * CHARACTER_SLUG_TAKEN na slug osiřelé/přímo vytvořené postavy, ačkoli
   * FIX-21 slibuje auto-suffix. Page.slug == Character.slug je invariant
   * (image mirror mapping v characters.getDirectory) → suffix musí padnout
   * už tady, ne až v characters.
   */
  private async ensureAvailableSlug(
    base: string,
    worldId: string,
  ): Promise<string> {
    let candidate = base;
    for (let attempt = 1; attempt <= 500; attempt++) {
      const collision =
        RESERVED_PAGE_SLUGS.has(candidate) ||
        (await this.pagesRepo.existsBySlugAndWorld(candidate, worldId)) ||
        (await this.charactersService.existsBySlug(candidate, worldId));
      if (!collision) return candidate;
      candidate = `${base}-${attempt + 1}`;
    }
    throw new ConflictException({
      code: 'PAGE_SLUG_TAKEN',
      message: 'Slug již existuje v tomto světě',
    });
  }

  async update(
    id: string,
    worldId: string,
    dto: UpdatePageDto,
    requester: PagesRequester,
  ): Promise<Page> {
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
    // 15.11 — moderátor edituje vždy; autor smí editovat SVŮJ pending návrh;
    // vlastník PC svou approved postavu. `ownerScoped` = ne-moderátor.
    const { ownerScoped } = await this.assertCanEditPage(
      worldId,
      requester,
      page,
    );
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
    // Ne-moderátor (vlastník PC / autor návrhu) smí měnit jen obsah, ne citlivá
    // pole — jinak by hráč mohl přes editaci vlastní postavy eskalovat přístup
    // (accessRequirements), předat vlastnictví (ownerUserId), obejít gating
    // přepnutím typu (type) nebo přebrat cizí URL (slug). Hodnoty zůstanou
    // z uložené stránky (do patch nejdou). `akjTabs` se NEmaže — řeší je
    // selektivní merge níže (resolveAkjTabsPatch): vlastník smí editovat obsah
    // POVOLENÝCH záložek, ne přístupová pravidla.
    if (ownerScoped) {
      delete persistDto.accessRequirements;
      delete persistDto.ownerUserId;
      delete persistDto.type;
      delete persistDto.slug;
    }
    // FIX-21 — `slug` je (přes PartialType) validní PATCH pole (editor umožňuje
    // ruční rename slugu). Dřív šel zápisem rovnou do `patch` bez normalizace
    // NEBO re-check kolize (jen syrový Mongo unique-index E11000 při shodě
    // s JINOU stránkou, žádná kontrola RESERVED_PAGE_SLUGS). Auto-suffix stejně
    // jako u create — jen když se slug fakticky mění (ne no-op PATCH).
    if (
      persistDto.slug !== undefined &&
      persistDto.slug.toLowerCase() !== page.slug
    ) {
      persistDto.slug = await this.ensureAvailableSlug(
        persistDto.slug.toLowerCase(),
        worldId,
      );
    }
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
    // AKJ záložky — editor bez plného čtení (vlastník-hráč / PomocnyPJ) dostal
    // v GET osekané `akjTabs`; nesmí je full-replace (smazal by skryté/PJ-only
    // záložky). resolveAkjTabsPatch → merge dle id nad DB (jen contentOverride
    // povolených záložek). PJ / elevated (seesAll) → full-replace beze změny.
    // Řeší i D-067. Viz spec-akj-owner-editable-content §4-5.
    if (persistDto.akjTabs !== undefined) {
      persistDto.akjTabs = await this.resolveAkjTabsPatch(
        page,
        worldId,
        requester,
        ownerScoped,
        persistDto.akjTabs,
      );
    }
    const patch: Partial<Page> = {
      ...persistDto,
      ...(safeContent !== undefined && { content: safeContent }),
      ...(safeSections && { sections: safeSections }),
      ...(persistDto.table && { table: sanitizeTable(persistDto.table) }),
      // akjTabs jsou v ...persistDto raw — přepiš sanitizovanou verzí.
      // Prázdné pole [] (smazání všech záložek) projde (je truthy).
      ...(persistDto.akjTabs && {
        akjTabs: sanitizeAkjTabs(persistDto.akjTabs),
      }),
      ...(persistDto.customData && {
        customData: sanitizeCustomData(persistDto.customData),
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
    };
    // RC-P1 fix — atomický optimistic lock. Když klient poslal expectedUpdatedAt,
    // zapiš JEN když se updatedAt mezitím nezměnil (podmínka v DB filtru). App-level
    // check výše je rychlá pojistka; tohle chytá i souběžný zápis v okně read↔write
    // (dva edity stejné verze → uspěje právě jeden, druhý 409).
    let updated: Page | null;
    if (dto.expectedUpdatedAt) {
      updated = await this.pagesRepo.updateIfUnchanged(
        id,
        patch,
        new Date(dto.expectedUpdatedAt),
      );
      if (!updated)
        throw new ConflictException({
          code: 'PAGE_CONFLICT',
          message:
            'Stránka byla mezitím upravena. Načti aktuální verzi nebo přepiš.',
        });
    } else {
      updated = await this.pagesRepo.update(id, patch);
    }
    // RC-P4 fix — stránka mohla být smazána v okně mezi findById a update →
    // update vrátí null → 404 místo dřívějšího 200 s prázdným (null) tělem.
    if (!updated)
      throw new NotFoundException({
        code: 'PAGE_NOT_FOUND',
        message: 'Stránka nenalezena',
      });
    // UM-03 — úklid starých blobů při výměně hero / odebrání položek galerie
    // (replace orphan; delete-cesta řeší jen smazání celé stránky).
    const orphaned: (string | null | undefined)[] = [];
    if (
      persistDto.imageUrl !== undefined &&
      page.imageUrl &&
      page.imageUrl !== persistDto.imageUrl
    ) {
      orphaned.push(page.imageUrl);
    }
    if (persistDto.galleryImages !== undefined) {
      const keptUrls = new Set(
        (persistDto.galleryImages ?? []).map((g) => g.url),
      );
      for (const g of page.galleryImages ?? []) {
        if (!keptUrls.has(g.url)) orphaned.push(g.url);
      }
    }
    if (orphaned.length > 0) {
      this.eventEmitter.emit('media.orphaned', { urls: orphaned });
    }
    void this.searchCoordinator
      ?.updatePageInIndex(updated)
      .catch((err: unknown) =>
        logWarn(this.logger, `updatePageInIndex selhal pro id=${id}`, err),
      );
    return updated;
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
    // FIX-59 — deletePageFromIndex bere `pageId` (search primaryKey), ne `slug`.
    void this.searchCoordinator
      ?.deletePageFromIndex(page.id)
      .catch((err: unknown) =>
        logWarn(
          this.logger,
          `deletePageFromIndex selhal pro ${page.slug}`,
          err,
        ),
      );
  }

  /**
   * B4b (spec 20B) — moderační skrytí / odkrytí stránky (akce M2/M3 a revert).
   * Systémová cesta z enforcement listeneru; bez world/role guardu (autorizoval
   * už moderační zásah). Na neznámém id vrátí false, nikdy nehází.
   */
  async setModerationHidden(
    id: string,
    hidden: boolean,
    reason?: string,
  ): Promise<boolean> {
    const updated = await this.pagesRepo.update(id, {
      moderationHidden: hidden,
      moderationHiddenReason: hidden ? reason : undefined,
    });
    return updated !== null;
  }

  async findDirectory(
    worldId: string,
    types?: string[],
    userId?: string,
    platformRole?: UserRole,
    elevatedWorldIds?: string[],
  ) {
    // R-AUDIT — world-view brána: přihlášený nečlen privátního světa nesmí
    // vidět adresář stránek (id/slug/title/type/imageUrl + existence AKJ přes
    // shieldedBy). D-DATA-SYNC-ZBYTKY a — brána běží VŽDY (i bez userId):
    // route má OptionalJwtAuthGuard, anonym smí JEN veřejný svět (parita
    // s legacy characters directory / assertCanViewDirectory).
    await this.assertCanViewWorld(
      worldId,
      userId,
      platformRole,
      elevatedWorldIds,
    );
    const allEntries = await this.pagesRepo.findDirectory(worldId, types);
    // B4b — moderačně skryté stránky vynech z adresáře pro všechny mimo reviewer
    // set (globální zásah, platí i pro PJ světa).
    const isReviewer =
      platformRole !== undefined && isContentReviewer(platformRole);
    const moderationFiltered = isReviewer
      ? allEntries
      : allEntries.filter((e) => !e.moderationHidden);
    // 15.11 — pending návrhy hráčů: v adresáři je vidí JEN autor (proposedBy) +
    // moderátor světa (elevovaný admin / role ≥ PomocnyPJ). findDirectory
    // NEvolá assertAccess, proto vlastní filtr. Membership načteme jednou a
    // reusneme i pro shieldedBy níže.
    const viewerMembership = userId
      ? await this.membershipRepo.findByUserAndWorld(userId, worldId)
      : null;
    const isModerator =
      (platformRole !== undefined &&
        worldAdminBypass({ role: platformRole, elevatedWorldIds }, worldId)) ||
      (viewerMembership != null &&
        viewerMembership.role >= WorldRole.PomocnyPJ);
    const entries = moderationFiltered.filter(
      (e) =>
        e.pageStatus !== 'pending' ||
        isModerator ||
        (userId != null && e.proposedBy === userId),
    );
    // D-062c — per-entry shieldedBy pro stub karty v listings. Membership +
    // akjSettings načteme JEDNOU (ne N+1 per stránka), a jen když je vůbec nějaká
    // stránka chráněná. Raw accessRequirements NEvracíme na FE (privacy — UserId).
    const anyProtected = entries.some(
      (e) => (e.accessRequirements?.length ?? 0) > 0,
    );
    const membership = viewerMembership;
    const needsAkjTypes =
      anyProtected &&
      entries.some((e) =>
        e.accessRequirements?.some((r) => r.type === 'AKJType'),
      );
    const akjSettings = needsAkjTypes
      ? ((await this.settingsRepo.findByWorldId(worldId))?.akjTypes ?? [])
      : [];
    // `moderationHidden` z entry NEpropouštíme na FE (interní příznak) — omit
    // přes rename na `_`-prefix (eslint no-unused-vars ignoruje).
    return entries.map(
      ({
        accessRequirements,
        moderationHidden: _moderationHidden,
        ...rest
      }) => ({
        ...rest,
        shieldedBy: anyProtected
          ? this.shieldedFromRequirements(
              accessRequirements,
              membership,
              akjSettings,
              userId ?? null,
            )
          : undefined,
      }),
    );
  }

  async findAllSlugs(
    worldId: string,
    requester: PagesRequester,
  ): Promise<string[]> {
    // N-37 — slug list je editor pomůcka (WikilinkSuggestion); bez gatingu
    // leakoval existenci/slugy AKJ-chráněných stránek všem přihlášeným.
    // PomocnyPJ+ (autorské role) nebo elevated platform Admin+.
    if (!worldAdminBypass(requester, worldId)) {
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
          requester?.elevatedWorldIds,
        );
        visible.add(page.slug);
      } catch {
        // bez přístupu — stránka se ze search výsledků vynechá
      }
    }
    return visible;
  }

  async findRandom(
    worldId: string,
    count: number,
    userId: string,
    platformRole?: UserRole,
    elevatedWorldIds?: string[],
  ): Promise<Page[]> {
    // R-AUDIT (IDOR fix) — dřív BEZ world-gate i BEZ per-page access → kdokoli
    // přihlášený enumerací stáhl až 50 plných stránek privátního světa vč.
    // AKJ-chráněných. Sjednoceno s findByWorld: world-level brána + per-page filtr.
    await this.assertCanViewWorld(
      worldId,
      userId,
      platformRole,
      elevatedWorldIds,
    );
    const pages = await this.pagesRepo.findRandom(
      worldId,
      Math.max(1, Math.min(count, 50)),
    );
    const visible: Page[] = [];
    for (const page of pages) {
      try {
        await this.assertAccess(
          page,
          userId,
          worldId,
          platformRole,
          elevatedWorldIds,
        );
        visible.push(page);
      } catch {
        continue; // bez page-level přístupu — stránka se vynechá
      }
    }
    return visible;
  }

  async findMeta(
    slug: string,
    worldId: string,
    userId?: string | null,
    platformRole?: UserRole,
    elevatedWorldIds?: string[],
  ): Promise<{
    isWoodWide: boolean;
    shieldedBy?: ShieldedRequirement[];
  }> {
    // R-AUDIT — world-view brána (jen s userId; interní callers bez usera skip):
    // dřív nečlen privátního světa mohl přes meta probovat existenci a shielding
    // stránek.
    if (userId) {
      await this.assertCanViewWorld(
        worldId,
        userId,
        platformRole,
        elevatedWorldIds,
      );
    }
    const page = await this.pagesRepo.findBySlugAndWorld(slug, worldId);
    if (!page)
      throw new NotFoundException({
        code: 'PAGE_NOT_FOUND',
        message: 'Stránka nenalezena',
      });
    // B4b — moderačně skrytá stránka: meta nevydáme nikomu mimo reviewer set.
    if (this.isModerationHiddenFor(page, platformRole)) {
      throw new NotFoundException({
        code: 'PAGE_NOT_FOUND',
        message: 'Stránka nenalezena',
      });
    }
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
    elevatedWorldIds?: string[],
  ): Promise<Pick<Page, 'slug' | 'title' | 'type'>[]> {
    // R-AUDIT — world-view brána: u NEchráněného targetu by nečlen privátního
    // světa jinak přes backlinks viděl seznam odkazujících stránek (per-page
    // assertAccess níže to samo nezachytí).
    await this.assertCanViewWorld(
      worldId,
      userId,
      platformRole,
      elevatedWorldIds,
    );
    const target = await this.pagesRepo.findBySlugAndWorld(targetSlug, worldId);
    if (!target)
      throw new NotFoundException({
        code: 'PAGE_NOT_FOUND',
        message: 'Stránka nenalezena',
      });
    // Cílová stránka musí být přístupná žadateli — jinak by jsme prozradili
    // existenci utajené stránky přes backlinks listing.
    await this.assertAccess(
      target,
      userId,
      worldId,
      platformRole,
      elevatedWorldIds,
    );

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
        await this.assertAccess(
          full,
          userId,
          worldId,
          platformRole,
          elevatedWorldIds,
        );
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
    userId: string | undefined,
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

  /**
   * B4b (spec 20B) — moderačně skrytá stránka (akce M2/M3) je GLOBÁLNÍ zásah:
   * nevidí ji ani PJ/členové světa (žádný world bypass), jen platform reviewer
   * set. true = skryj před tímto viewerem.
   */
  private isModerationHiddenFor(page: Page, platformRole?: UserRole): boolean {
    if (!page.moderationHidden) return false;
    return !(platformRole !== undefined && isContentReviewer(platformRole));
  }

  private async assertAccess(
    page: Page,
    userId: string | undefined,
    worldId: string,
    platformRole?: UserRole,
    elevatedWorldIds?: string[],
  ): Promise<void> {
    // B4b — moderační skrytí má přednost PŘED per-stránka access i world bypassem
    // (zásah platí i pro PJ). 404 = neprozrazuje existenci (auth-leak-policy).
    if (this.isModerationHiddenFor(page, platformRole)) {
      throw new NotFoundException({
        code: 'PAGE_NOT_FOUND',
        message: 'Stránka nenalezena',
      });
    }
    // 15.11 — pending návrh hráče vidí JEN autor (proposedBy) + moderátor
    // (elevovaný admin / role ≥ PomocnyPJ). MUSÍ být PŘED early-return na prázdné
    // accessRequirements (návrh je má prázdné → jinak by prosákl všem).
    // 404 = neprozrazuje existenci (auth-leak-policy).
    if (page.pageStatus === 'pending') {
      if (userId && page.proposedBy === userId) return;
      if (
        platformRole !== undefined &&
        worldAdminBypass({ role: platformRole, elevatedWorldIds }, worldId)
      )
        return;
      const m = userId
        ? await this.membershipRepo.findByUserAndWorld(userId, worldId)
        : null;
      if (m && m.role >= WorldRole.PomocnyPJ) return;
      throw new NotFoundException({
        code: 'PAGE_NOT_FOUND',
        message: 'Stránka nenalezena',
      });
    }
    if (!page.accessRequirements || page.accessRequirements.length === 0)
      return;
    // AKJ skrývá obsah jen před hráči. PomocnyPJ+ (autorské role) a platform
    // Admin+ ho obcházejí — jinak by se PJ zamkl ze svého vlastního obsahu.
    // Admin bypass jen při world elevaci (R-20 / spec-world-admin-elevation).
    if (
      platformRole !== undefined &&
      worldAdminBypass({ role: platformRole, elevatedWorldIds }, worldId)
    )
      return;
    // 22.4 — anonym: lookup přeskočit. `findByUserAndWorld(undefined, …)` by
    // mongoose strip-em undefined matchnul CIZÍ membership (leak role).
    const membership = userId
      ? await this.membershipRepo.findByUserAndWorld(userId, worldId)
      : null;
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
      message: 'Na tuto stránku nemáš přístup — je vyhrazená.',
    });
  }

  /**
   * R-09b — world-level read brána. `assertAccess` gatuje JEN per-stránka
   * `accessRequirements`; nechráněnou stránku tak viděl KAŽDÝ přihlášený, i
   * nečlen privátního světa (cross-tenant read leak — odhalil IS gauntlet,
   * seed-scenario-isolation). Chybělo patro nad stránkou: privátní svět smí
   * číst jen jeho člen (nebo platform Admin+ — read viditelnost ponechána, R-20).
   * Veřejný / open / closed svět zůstává čitelný — konzistentní s
   * `worlds.service.applyDetailScope` (gatuje pouze `private`). 403 (ne 404)
   * dle rozhodnutí: friendly hláška „nemáte přístup" (auth-leak-policy: auth-
   * required, existuje-ale-není-můj → 403).
   */
  private async assertCanViewWorld(
    worldId: string,
    userId: string | undefined,
    platformRole?: UserRole,
    elevatedWorldIds?: string[],
  ): Promise<void> {
    const world = await this.worldsRepo.findById(worldId);
    if (!world)
      throw new NotFoundException({
        code: 'WORLD_NOT_FOUND',
        message: 'Svět nenalezen',
      });
    if (world.accessMode !== 'private') return;
    // Read viditelnost pro platform Admin+ ponechána (R-20), ale jen při world
    // elevaci. De-elevated admin čte privátní svět jen jako jeho člen.
    if (
      platformRole !== undefined &&
      worldAdminBypass({ role: platformRole, elevatedWorldIds }, worldId)
    )
      return;
    // Anonym (OptionalJwt na directory route) nemá membership → deny.
    const membership = userId
      ? await this.membershipRepo.findByUserAndWorld(userId, worldId)
      : null;
    if (membership) return;
    throw new ForbiddenException({
      code: 'WORLD_ACCESS_DENIED',
      message: 'Tahle část světa je jen pro jeho členy.',
    });
  }

  /**
   * Selektivní merge `akjTabs` pro editora s NEúplným čtením (vlastník-hráč /
   * PomocnyPJ — kdokoli bez `seesAll`). Base = uložené záložky z DB; z příchozích
   * se přebírá POUZE `contentOverride`, a jen u záložek, kde `mayEditContent`
   * vrací true. Ostatní pole (id/name/order/access/ownerHidden/ownerEditable)
   * i needitovatelné/neviditelné/nespárované záložky zůstávají z DB — editor tak
   * nemůže eskalovat přístup, přejmenovat, přeuspořádat, přidat/smazat ani
   * strhnout obsah záložek, které nevidí. Viz spec-akj-owner-editable-content §4.
   */
  private mergeAkjTabContentOnly(
    dbTabs: AkjTab[] | undefined,
    incoming: AkjTab[],
    mayEditContent: (dbTab: AkjTab) => boolean,
  ): AkjTab[] {
    const byId = new Map(incoming.map((t) => [t.id, t]));
    return (dbTabs ?? []).map((dbTab) => {
      if (!mayEditContent(dbTab)) return dbTab;
      const inc = byId.get(dbTab.id);
      if (!inc) return dbTab; // editor záložku neposlal → beze změny
      return { ...dbTab, contentOverride: inc.contentOverride };
    });
  }

  /**
   * Rozhodne finální `akjTabs` pro `update()` podle úplnosti čtení editora.
   * `seesAll` (PJ / elevated admin) → full-replace z DTO (má kompletní data,
   * dnešní chování). Jinak (PomocnyPJ / vlastník-hráč) → content-only merge
   * nad DB (mergeAkjTabContentOnly):
   *  - vlastník PC (ownerScoped): jen záložky s `ownerEditable && !ownerHidden`,
   *  - PomocnyPJ: jen záložky, které PLNĚ vidí (`passesAccess`, ne locked/skryté).
   * Sjednocuje owner-editable i fix D-067 (PomocnyPJ full-replace data-loss).
   * Viz spec-akj-owner-editable-content §4-5.
   */
  private async resolveAkjTabsPatch(
    page: Page,
    worldId: string,
    requester: PagesRequester,
    ownerScoped: boolean,
    incoming: AkjTab[],
  ): Promise<AkjTab[]> {
    const membership = await this.membershipRepo.findByUserAndWorld(
      requester.id,
      worldId,
    );
    const seesAll =
      worldAdminBypass(requester, worldId) ||
      (!!membership && membership.role >= WorldRole.PJ);
    // PJ / elevated admin → kompletní data → full-replace (dnešní chování).
    if (!ownerScoped && seesAll) return incoming;

    const db = page.akjTabs ?? [];
    if (ownerScoped) {
      // Vlastník PC — jen záložky, které mu PJ zpřístupnil k editaci a které vidí.
      const isOwner = !!page.ownerUserId && page.ownerUserId === requester.id;
      return this.mergeAkjTabContentOnly(
        db,
        incoming,
        (t) => isOwner && t.ownerEditable === true && !t.ownerHidden,
      );
    }
    // PomocnyPJ (write právo, ale ne seesAll) — jen záložky, které plně vidí
    // (stejný predikát jako read gate filterAkjTabsForViewer).
    const needsAkjTypes = db.some((t) =>
      t.access.some((r) => r.type === 'AKJType'),
    );
    const akjTypes = needsAkjTypes
      ? ((await this.settingsRepo.findByWorldId(worldId))?.akjTypes ?? [])
      : [];
    return this.mergeAkjTabContentOnly(db, incoming, (t) =>
      this.passesAccess(t.access, requester.id, membership, akjTypes),
    );
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
    userId: string | undefined,
    worldId: string,
    platformRole?: UserRole,
    elevatedWorldIds?: string[],
  ): Promise<Page> {
    if (!page.akjTabs || page.akjTabs.length === 0) return page;
    // 22.4 — anonym: lookup přeskočit (viz assertAccess — undefined by matchnul
    // cizí membership).
    const membership = userId
      ? await this.membershipRepo.findByUserAndWorld(userId, worldId)
      : null;
    const seesAll =
      (platformRole !== undefined &&
        worldAdminBypass({ role: platformRole, elevatedWorldIds }, worldId)) ||
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
    // RC-D2 (race-condition audit) — svět se načte VŽDY (i pro Admin), aby šlo
    // ověřit, že je aktivní. `worldsRepo.findById` (BaseMongo) NEfiltruje
    // `isActive`, takže soft-smazaný svět by tudy prošel a create by vytvořil
    // phantom dítě (stránku/postavu) v mrtvém světě.
    const world = await this.worldsRepo.findById(worldId);
    if (!world || !world.isActive || world.deletedAt)
      throw new NotFoundException({
        code: 'WORLD_NOT_FOUND',
        message: 'Svět nenalezen',
      });
    if (worldAdminBypass(requester, worldId)) return;
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

  /**
   * 15.11 — rozhodne režim tvorby stránky (+ ověří aktivní svět jako
   * assertCanWrite):
   *  - moderátor (elevovaný admin / role ≥ PomocnyPJ) → `approved` (dnešní tok),
   *  - hráč (role ≥ Hráč) navrhující whitelist typ → `pending` (autor = on sám),
   *  - jinak 403 `PAGE_FORBIDDEN`.
   */
  private async resolveCreateMode(
    worldId: string,
    requester: PagesRequester,
    type: PageType,
  ): Promise<{ pageStatus: 'pending' | 'approved'; proposedBy?: string }> {
    const world = await this.worldsRepo.findById(worldId);
    if (!world || !world.isActive || world.deletedAt)
      throw new NotFoundException({
        code: 'WORLD_NOT_FOUND',
        message: 'Svět nenalezen',
      });
    if (worldAdminBypass(requester, worldId)) return { pageStatus: 'approved' };
    const membership = await this.membershipRepo.findByUserAndWorld(
      requester.id,
      worldId,
    );
    const role = membership?.role ?? -1;
    if (role >= WorldRole.PomocnyPJ) return { pageStatus: 'approved' };
    // 15.11 — hráč (Hráč+) smí navrhnout whitelist typ jako pending návrh.
    if (role >= WorldRole.Hrac && PLAYER_PROPOSABLE_PAGE_TYPES.includes(type)) {
      return { pageStatus: 'pending', proposedBy: requester.id };
    }
    throw new ForbiddenException({
      code: 'PAGE_FORBIDDEN',
      message: 'Nedostatečná oprávnění',
    });
  }

  /**
   * 15.11 — brána pro editaci stránky. Moderátor (assertCanWrite ≥ PomocnyPJ)
   * vždy; autor SVÉHO pending návrhu (whitelist typ, role ≥ Hráč) taky — může
   * doladit, než ho PJ schválí. Self-approve nehrozí: `pageStatus`/`proposedBy`
   * nejsou v UpdatePageDto, takže je editací nezmění.
   */
  private async assertCanEditPage(
    worldId: string,
    requester: PagesRequester,
    page: Page,
  ): Promise<{ ownerScoped: boolean }> {
    // `ownerScoped` = ne-moderátorská editace (autor návrhu / vlastník PC).
    // Update takovému editorovi osekne citlivá pole (přístup / vlastnictví /
    // typ) — smí měnit jen obsah, ne eskalovat práva.
    if (
      page.pageStatus === 'pending' &&
      page.proposedBy === requester.id &&
      PLAYER_PROPOSABLE_PAGE_TYPES.includes(page.type)
    ) {
      const membership = await this.membershipRepo.findByUserAndWorld(
        requester.id,
        worldId,
      );
      if (membership && membership.role >= WorldRole.Hrac)
        return { ownerScoped: true };
    }
    // Vlastník své postavy hráče smí editovat vlastní stránku (Bio), i když je
    // approved a sám není moderátor. FE mu tlačítko „Upravit Bio" ukazuje
    // (PostavaLayout: canEdit = moderátor || isOwner) — bez téhle větve dostal
    // 403 a FE hlásil generické „Uložení selhalo".
    if (
      page.type === 'Postava hráče' &&
      page.ownerUserId &&
      page.ownerUserId === requester.id
    ) {
      const membership = await this.membershipRepo.findByUserAndWorld(
        requester.id,
        worldId,
      );
      if (membership && membership.role >= WorldRole.Hrac)
        return { ownerScoped: true };
    }
    await this.assertCanWrite(worldId, requester);
    return { ownerScoped: false };
  }

  /** 15.11 — PJ (moderátor) schválí návrh → `approved` (živé + do search indexu). */
  async approveProposal(
    worldId: string,
    slug: string,
    requester: PagesRequester,
  ): Promise<Page> {
    await this.assertCanWrite(worldId, requester);
    const page = await this.pagesRepo.findBySlugAndWorld(slug, worldId);
    if (!page || page.pageStatus !== 'pending')
      throw new NotFoundException({
        code: 'PROPOSAL_NOT_FOUND',
        message: 'Návrh nenalezen',
      });
    const updated = (await this.pagesRepo.update(page.id, {
      pageStatus: 'approved',
    })) ?? { ...page, pageStatus: 'approved' as const };
    // Pending se do search NEindexuje (viz create) — až po schválení.
    void this.searchCoordinator
      ?.addPageToIndex(updated)
      .catch((err: unknown) =>
        logWarn(this.logger, `addPageToIndex selhal pro ${updated.slug}`, err),
      );
    this.eventEmitter.emit('world.page-review.resolved', {
      worldId,
      slug,
      pageId: page.id,
      action: 'approved',
      authorId: page.proposedBy,
    });
    return updated;
  }

  /**
   * 15.11 — PJ vrátí návrh k přepracování (`rework` — zůstane pending, autor
   * doladí) nebo zahodí (`discard` — smaže stránku). Autor dostane WS signál.
   */
  async rejectProposal(
    worldId: string,
    slug: string,
    mode: 'rework' | 'discard',
    requester: PagesRequester,
  ): Promise<{ ok: true }> {
    await this.assertCanWrite(worldId, requester);
    const page = await this.pagesRepo.findBySlugAndWorld(slug, worldId);
    if (!page || page.pageStatus !== 'pending')
      throw new NotFoundException({
        code: 'PROPOSAL_NOT_FOUND',
        message: 'Návrh nenalezen',
      });
    if (mode === 'discard') {
      await this.delete(page.id, worldId, requester);
    }
    this.eventEmitter.emit('world.page-review.resolved', {
      worldId,
      slug,
      pageId: page.id,
      action: mode,
      authorId: page.proposedBy,
    });
    return { ok: true };
  }

  /** 15.11 — pending návrhy obsahu světa (pro PJ frontu ke zpracování). */
  async findPendingProposals(worldId: string): Promise<Page[]> {
    return this.pagesRepo.findPendingByWorld(worldId);
  }

  /**
   * RC-D2 (race-condition audit) — re-ověří, že svět je stále aktivní. Volá se
   * PO zápisu stránky (create), aby pokryl okno, kdy se svět soft-smazal mezi
   * `assertCanWrite` readem a `pagesRepo.save`. Vrací true, když svět žije.
   */
  private async isWorldActive(worldId: string): Promise<boolean> {
    const world = await this.worldsRepo.findById(worldId);
    return !!world && world.isActive && !world.deletedAt;
  }
}
