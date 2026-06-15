import {
  Injectable,
  Inject,
  Logger,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { logError } from '../../common/logging/log-error.util';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { ICharactersRepository } from './interfaces/characters-repository.interface';
import type { IWorldMembershipRepository } from '../worlds/interfaces/world-membership-repository.interface';
import type { IWorldsRepository } from '../worlds/interfaces/worlds-repository.interface';
import type { IPagesRepository } from '../pages/interfaces/pages-repository.interface';
import type {
  Character,
  CharacterDirectoryEntry,
  CharacterPublicView,
  PlayerCharacter,
} from './interfaces/character.interface';
import type { CreateCharacterDto } from './dto/create-character.dto';
import type { UpdateCharacterDto } from './dto/update-character.dto';
import type { ConvertCharacterDto } from './dto/convert-character.dto';
import { WorldRole } from '../worlds/interfaces/world-membership.interface';
import { UserRole } from '../users/interfaces/user.interface';

@Injectable()
export class CharactersService {
  private readonly logger = new Logger(CharactersService.name);

  constructor(
    @Inject('ICharactersRepository')
    private readonly charRepo: ICharactersRepository,
    @Inject('IWorldMembershipRepository')
    private readonly membershipRepo: IWorldMembershipRepository,
    // 10.2g — imageUrl postavy žije v Page (sjednocení 9.1); list endpointy
    // ho doplňují pro avatar ve spawn paletě (vzor: maps.enrichTokens).
    @Inject('IPagesRepository')
    private readonly pagesRepo: IPagesRepository,
    // RC-D2 (race-condition audit) — guard proti create postavy v soft-smazaném
    // světě (assertCanManage čte stav světa, ne jen membership).
    @Inject('IWorldsRepository')
    private readonly worldsRepo: IWorldsRepository,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /** 10.2g — mapa slug → imageUrl z Page pro daný svět (avatar v paletě). */
  private async imageUrlBySlug(
    worldId: string,
  ): Promise<Map<string, string | undefined>> {
    const pages = await this.pagesRepo.findByWorld(worldId);
    return new Map(pages.map((p) => [p.slug, p.imageUrl]));
  }

  /**
   * 8.6 — Najde character podle ID. Vrátí null pokud neexistuje.
   * Použito v gateways pro broadcast (najít `userId` z `characterId`).
   */
  async findById(characterId: string): Promise<Character | null> {
    return this.charRepo.findById(characterId);
  }

  /**
   * 8.6 — Vrátí true pokud uživatel je PomocnyPJ+ ve světě.
   * Použito v `CharacterAccountsService` pro role-aware permission gating.
   */
  async isWorldStaff(
    worldId: string,
    userId: string,
    globalRole?: UserRole,
  ): Promise<boolean> {
    // R-02 — GlobalAdmin (Sa/Admin) bypass, konzistentně se sourozencem
    // `campaign.getWorldRole` (admin→PJ). Volitelný param: volající bez role
    // = bez bypassu (fail-safe — radši odepře, než aby tiše povolil).
    if (globalRole !== undefined && globalRole <= UserRole.Admin) return true;
    const membership = await this.membershipRepo.findByUserAndWorld(
      userId,
      worldId,
    );
    return !!membership && membership.role >= WorldRole.PomocnyPJ;
  }

  async assertCanManage(
    userId: string,
    userRole: UserRole,
    worldId: string,
  ): Promise<void> {
    // RC-D2 (race-condition audit) — svět musí být aktivní (i pro Admin), jinak
    // by create postavy vytvořil phantom dítě v soft-smazaném světě.
    // `worldsRepo.findById` (BaseMongo) NEfiltruje `isActive`.
    const world = await this.worldsRepo.findById(worldId);
    if (!world || !world.isActive || world.deletedAt)
      throw new NotFoundException({
        code: 'WORLD_NOT_FOUND',
        message: 'Svět nenalezen',
      });
    if (userRole <= UserRole.Admin) return;
    const membership = await this.membershipRepo.findByUserAndWorld(
      userId,
      worldId,
    );
    if (!membership || membership.role < WorldRole.PJ)
      throw new ForbiddenException({
        code: 'CHARACTER_FORBIDDEN',
        message: 'Nedostatečná oprávnění',
      });
  }

  async findByWorld(worldId: string): Promise<CharacterPublicView[]> {
    const characters = await this.charRepo.findByWorld(worldId);
    const imgBySlug = await this.imageUrlBySlug(worldId);
    return characters.map((c) => this.toPublicView(c, imgBySlug.get(c.slug)));
  }

  async findBySlug(
    slug: string,
    worldId: string,
    requesterId: string,
  ): Promise<Character | CharacterPublicView> {
    const character = await this.charRepo.findBySlugAndWorld(slug, worldId);
    if (!character)
      throw new NotFoundException({
        code: 'CHARACTER_NOT_FOUND',
        message: 'Postava nenalezena',
      });

    const membership = await this.membershipRepo.findByUserAndWorld(
      requesterId,
      worldId,
    );
    // 8.1 — PomocnyPJ+ (štáb světa) i vlastník vidí plnou postavu vč. soukromé části.
    const isStaff = membership && membership.role >= WorldRole.PomocnyPJ;
    const isOwner = !character.isNpc && character.userId === requesterId;

    if (isStaff || isOwner) return character;
    return this.toPublicView(character);
  }

  async findBySlugRaw(slug: string, worldId: string): Promise<Character> {
    const character = await this.charRepo.findBySlugAndWorld(slug, worldId);
    if (!character)
      throw new NotFoundException({
        code: 'CHARACTER_NOT_FOUND',
        message: 'Postava nenalezena',
      });
    return character;
  }

  async assertSubdocAccess(
    slug: string,
    worldId: string,
    requesterId: string,
    _options?: { action?: 'read' | 'write' },
  ): Promise<Character> {
    const character = await this.charRepo.findBySlugAndWorld(slug, worldId);
    if (!character)
      throw new NotFoundException({
        code: 'CHARACTER_NOT_FOUND',
        message: 'Postava nenalezena',
      });
    const membership = await this.membershipRepo.findByUserAndWorld(
      requesterId,
      worldId,
    );

    // 8.1-FIR (2026-05-24) — Lokace nemá owner. Po sjednocení access pravidel
    // pro 5 subdoc tabů (Finance/Výbava/Kalendář/Deník/Poznámky) i Lokace
    // vyžaduje PomocnyPJ+ pro read i write. Spec 9.2 (kalendář není tajný)
    // ustupuje přísnější UX policy: subdoc obsah lokace vidí jen štáb světa.
    // Anti-leak: bez membership 404 (jako kdyby postava neexistovala).
    if (character.kind === 'location') {
      if (!membership)
        throw new NotFoundException({
          code: 'CHARACTER_NOT_FOUND',
          message: 'Postava nenalezena',
        });
      if (membership.role < WorldRole.PomocnyPJ)
        throw new ForbiddenException({
          code: 'CHARACTER_ACCESS_DENIED',
          message: 'Přístup odepřen',
        });
      return character;
    }

    // 8.1 — Persona subdokumenty: PomocnyPJ+ (štáb) nebo vlastník.
    const isStaff = membership && membership.role >= WorldRole.PomocnyPJ;
    const isOwner = !character.isNpc && character.userId === requesterId;
    if (!isStaff && !isOwner)
      throw new ForbiddenException({
        code: 'CHARACTER_ACCESS_DENIED',
        message: 'Přístup odepřen',
      });
    return character;
  }

  async findByUser(userId: string, worldId: string): Promise<Character | null> {
    return this.charRepo.findByUserAndWorld(userId, worldId);
  }

  /** N-24 — všechny PC postavy hráče ve světě (může jich mít víc). */
  async findUserCharacters(
    userId: string,
    worldId: string,
  ): Promise<Character[]> {
    return this.charRepo.findManyByUserAndWorld(userId, worldId);
  }

  async getPlayerCharacters(worldId: string): Promise<PlayerCharacter[]> {
    // 10.2c-edit-6: rozšířený DTO o id/isNpc/userId — FE PcPalette potřebuje
    // `id` pro spawn payload (`characterId`) a `userId` pro UI rozlišení
    // "volná PC postava" vs. "PC s ownerem".
    const characters = await this.charRepo.findPlayerCharacters(worldId);
    const imgBySlug = await this.imageUrlBySlug(worldId);
    return characters.map((c) => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      isNpc: c.isNpc,
      userId: c.userId,
      imageUrl: imgBySlug.get(c.slug),
    }));
  }

  async getDirectory(worldId: string): Promise<CharacterDirectoryEntry[]> {
    const entries = await this.charRepo.findDirectory(worldId);
    const imgBySlug = await this.imageUrlBySlug(worldId);
    return entries.map((e) => ({ ...e, imageUrl: imgBySlug.get(e.slug) }));
  }

  async create(dto: CreateCharacterDto, worldId: string): Promise<Character> {
    const slug = dto.slug.toLowerCase();
    const exists = await this.charRepo.existsBySlugAndWorld(slug, worldId);
    if (exists)
      throw new ConflictException({
        code: 'CHARACTER_SLUG_TAKEN',
        message: 'Slug již existuje v tomto světě',
      });

    const character = await this.charRepo.save({
      ...(dto as unknown as Partial<Character>),
      slug,
      worldId,
      diaryData: {},
      extraBlocks: [],
    });

    // emitAsync — počká na kaskádu subdokumentů; 201 se vrátí až s kompletní postavou.
    // 9.1 — imageUrl odebráno z payloadu (Page mirror ho drží).
    await this.eventEmitter.emitAsync('character.created', {
      characterId: character.id,
      worldId: character.worldId,
      userId: character.userId,
      isNpc: character.isNpc,
      // Spec 9.2 — `'location'` skipne diary/finance/inventory/notes
      // v CharacterSubdocsService.onCharacterCreated.
      kind: character.kind,
      name: character.name,
      slug: character.slug,
    });

    return character;
  }

  async update(
    slug: string,
    worldId: string,
    dto: UpdateCharacterDto,
    requester?: { id: string; role: UserRole },
  ): Promise<Character> {
    const character = await this.charRepo.findBySlugAndWorld(slug, worldId);
    if (!character)
      throw new NotFoundException({
        code: 'CHARACTER_NOT_FOUND',
        message: 'Postava nenalezena',
      });
    if (requester && requester.role > UserRole.Admin) {
      const membership = await this.membershipRepo.findByUserAndWorld(
        requester.id,
        worldId,
      );
      // 8.1 — úpravu postavy smí provést PomocnyPJ+ (štáb) nebo vlastník.
      const isStaff = membership && membership.role >= WorldRole.PomocnyPJ;
      const isOwner = !character.isNpc && character.userId === requester.id;
      if (!isStaff && !isOwner)
        throw new ForbiddenException({
          code: 'CHARACTER_FORBIDDEN',
          message: 'Nedostatečná oprávnění',
        });
    }

    // D-073 (2026-05-23) — optimistic concurrency check. Vzor 7.2k (stránky).
    // Pokud klient poslal `expectedUpdatedAt` a postava byla mezitím změněna
    // (jiný PomocnyPJ+ nebo druhý tab), vrátíme 409.
    if (dto.expectedUpdatedAt) {
      const serverUpdatedAt = character.updatedAt
        ? new Date(character.updatedAt).toISOString()
        : null;
      if (serverUpdatedAt && serverUpdatedAt !== dto.expectedUpdatedAt) {
        throw new ConflictException({
          code: 'CHARACTER_CONFLICT',
          message:
            'Postava byla mezitím upravena. Načti aktuální verzi nebo přepiš.',
          serverUpdatedAt,
        });
      }
    }

    // D-073 — `expectedUpdatedAt` je jen pro concurrency check, ne pro persist.
    const { expectedUpdatedAt: _ignored, ...persistDto } = dto;
    const updateData: Partial<Character> = {
      ...(persistDto as unknown as Partial<Character>),
    };
    if (dto.diaryData !== undefined) {
      // Shallow merge: klíče z dto přidají/přepíší, ostatní zůstanou. Vnořené objekty se nahrazují celé.
      updateData.diaryData = {
        ...(character.diaryData ?? {}),
        ...dto.diaryData,
      };
    }

    const result = (await this.charRepo.update(character.id, updateData))!;
    // 9.1 — imageUrl odebráno z payloadu (Page mirror ho drží).
    this.eventEmitter.emit('character.updated', {
      characterId: result.id,
      worldId,
      userId: result.userId,
      isNpc: result.isNpc,
      name: result.name,
      slug: result.slug,
    });
    return result;
  }

  /**
   * 10.2c-edit-7 — sync `kind` z Page type při změně typu Page.
   *
   * Volá `pages.service` po update Page, pokud Page má `characterRef` a typ
   * se změnil (Lokace ↔ Postava hráče / NPC). Bez sync zůstane Character.kind
   * zaostalý a PC paleta na taktické mapě postavu odmítá (nebo zahrnuje
   * Lokaci, kterou by neměla).
   *
   * Idempotent: pokud `kind` už odpovídá, no-op (žádný DB update).
   */
  async syncKind(
    characterId: string,
    kind: 'persona' | 'location',
  ): Promise<void> {
    const character = await this.charRepo.findById(characterId);
    if (!character) return; // ne-existuje — silent skip (consistency reconcile)
    if (character.kind === kind) return; // no-op
    await this.charRepo.update(characterId, { kind });
  }

  async convert(
    slug: string,
    worldId: string,
    dto: ConvertCharacterDto,
  ): Promise<Character> {
    const character = await this.charRepo.findBySlugAndWorld(slug, worldId);
    if (!character)
      throw new NotFoundException({
        code: 'CHARACTER_NOT_FOUND',
        message: 'Postava nenalezena',
      });

    const toNpc = !dto.userId;
    const updated = await this.charRepo.update(character.id, {
      userId: toNpc ? undefined : dto.userId,
      isNpc: toNpc,
    });

    // 9.1 — imageUrl odebráno z payloadu (Page mirror ho drží).
    await this.eventEmitter.emitAsync('character.converted', {
      characterId: character.id,
      worldId,
      toNpc,
      userId: toNpc ? character.userId : dto.userId,
      name: character.name,
      slug: character.slug,
    });

    return updated!;
  }

  async delete(slug: string, worldId: string): Promise<void> {
    const character = await this.charRepo.findBySlugAndWorld(slug, worldId);
    if (!character)
      throw new NotFoundException({
        code: 'CHARACTER_NOT_FOUND',
        message: 'Postava nenalezena',
      });
    await this.charRepo.delete(character.id);
    // CD-09 (cascade-delete audit) — cascade je best-effort: postava už je
    // smazána, selhání jednoho listeneru (účty/subdocy/membership) nesmí shodit
    // delete (HTTP 500) ani zablokovat ostatní (emitAsync je spouští nezávisle).
    // Chyba se loguje; případný orphan dočistí M-SCAN (tools/orphan-scan).
    try {
      await this.eventEmitter.emitAsync('character.deleted', {
        characterId: character.id,
        worldId,
        slug: character.slug,
      });
    } catch (err) {
      logError(
        this.logger,
        `character.deleted cascade částečně selhala (${character.slug})`,
        err,
      );
    }
  }

  private toPublicView(c: Character, imageUrl?: string): CharacterPublicView {
    return {
      id: c.id,
      slug: c.slug,
      name: c.name,
      worldId: c.worldId,
      isNpc: c.isNpc,
      imageUrl,
    };
  }
}
