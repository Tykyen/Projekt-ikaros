import {
  Injectable,
  Inject,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { IWorldMapsRepository } from './interfaces/world-maps-repository.interface';
import type { IWorldMapFoldersRepository } from './interfaces/world-map-folders-repository.interface';
import type { IWorldMembershipRepository } from '../worlds/interfaces/world-membership-repository.interface';
import type { IWorldsRepository } from '../worlds/interfaces/worlds-repository.interface';
import type {
  WorldMapEntry,
  WorldMapPin,
} from './interfaces/world-map.interface';
import type { WorldMapFolder } from './interfaces/world-map-folder.interface';
import { WorldRole } from '../worlds/interfaces/world-membership.interface';
import { worldAdminBypass } from '../../common/utils/world-elevation';
import type { RequestUser } from '../../common/interfaces/request-user.interface';
import type { CreateMapDto } from './dto/create-map.dto';
import type { UpdateMapDto } from './dto/update-map.dto';
import type { CreatePinDto } from './dto/create-pin.dto';
import type { UpdatePinDto } from './dto/update-pin.dto';
import type { CreateFolderDto } from './dto/create-folder.dto';
import type { UpdateFolderDto } from './dto/update-folder.dto';
import { EventEmitter2 } from '@nestjs/event-emitter';

@Injectable()
export class WorldMapsService {
  constructor(
    @Inject('IWorldMapsRepository')
    private readonly repo: IWorldMapsRepository,
    @Inject('IWorldMapFoldersRepository')
    private readonly foldersRepo: IWorldMapFoldersRepository,
    @Inject('IWorldMembershipRepository')
    private readonly membershipRepo: IWorldMembershipRepository,
    @Inject('IWorldsRepository')
    private readonly worldsRepo: IWorldsRepository,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Smí daný uživatel spravovat mapy světa? Platform Admin/Superadmin jen
   * s aktivní elevací pro tento svět (worldAdminBypass) NEBO world PJ.
   */
  async canManage(
    requester: Pick<RequestUser, 'id' | 'role' | 'elevatedWorldIds'>,
    worldId: string,
  ): Promise<boolean> {
    if (worldAdminBypass(requester, worldId)) return true;
    const membership = await this.membershipRepo.findByUserAndWorld(
      requester.id,
      worldId,
    );
    // D-NEW-INV-MAPS — atlas „Mapy" sjednocen na PomocnyPJ+ (jako taktická mapa /
    // zvuky / deník PJ); dřív byl práh jen PJ (nejednotnost role-prahů).
    return !!membership && membership.role >= WorldRole.PomocnyPJ;
  }

  async assertCanManage(
    requester: Pick<RequestUser, 'id' | 'role' | 'elevatedWorldIds'>,
    worldId: string,
  ): Promise<void> {
    if (!(await this.canManage(requester, worldId)))
      throw new ForbiddenException({
        code: 'NOT_WORLD_PJ',
        message: 'Nedostatečná oprávnění',
      });
  }

  /**
   * R-AUDIT — read brána atlasu: private svět jen pro členy/elevovaného admina.
   * Dřív list/listFolders BEZ ní → přihlášený nečlen enumerací `?worldId=` stáhl
   * isPublic mapy/složky (title/description/imageUrl/piny) cizího privátního světa.
   * Public/open/closed a neexistující svět beze změny (per-map isPublic řeší zbytek).
   */
  async assertCanViewAtlas(
    requester: Pick<RequestUser, 'id' | 'role' | 'elevatedWorldIds'>,
    worldId: string,
  ): Promise<void> {
    const world = await this.worldsRepo.findById(worldId);
    if (!world || world.accessMode !== 'private') return;
    if (worldAdminBypass(requester, worldId)) return;
    const membership = await this.membershipRepo.findByUserAndWorld(
      requester.id,
      worldId,
    );
    if (!membership)
      throw new ForbiddenException({
        code: 'WORLD_ACCESS_DENIED',
        message: 'Atlas map je jen pro členy tohoto světa.',
      });
  }

  // ── Kaskádová viditelnost ────────────────────────────────────────────────
  /**
   * Set id složek, které hráč vidí: složka je viditelná, jen když je viditelná
   * sama (public / v `visibleToPlayerIds`) **a zároveň** je viditelná celá cesta
   * k rootu (rodič rekurzivně). Memoizováno.
   */
  private visibleFolderIds(
    folders: WorldMapFolder[],
    userId: string | null,
  ): Set<string> {
    const byId = new Map(folders.map((f) => [f.id, f]));
    const memo = new Map<string, boolean>();
    const visible = (id: string): boolean => {
      const cached = memo.get(id);
      if (cached !== undefined) return cached;
      const f = byId.get(id);
      if (!f) return false;
      const selfOk =
        f.isPublic ||
        (userId !== null && f.visibleToPlayerIds.includes(userId));
      const parentOk = f.parentId === null || visible(f.parentId);
      const result = selfOk && parentOk;
      memo.set(id, result);
      return result;
    };
    const set = new Set<string>();
    for (const f of folders) if (visible(f.id)) set.add(f.id);
    return set;
  }

  // ── Mapy ──────────────────────────────────────────────────────────────────
  /**
   * Mapy světa setříděné dle `order`. PJ/Admin vše; hráč jen mapy, na které má
   * přístup a které jsou v jemu viditelné složce (kaskáda), bez
   * `visibleToPlayerIds` (leak-safe).
   */
  async list(
    worldId: string,
    userId: string | null,
    isPjOrAdmin: boolean,
  ): Promise<WorldMapEntry[]> {
    const maps = (await this.repo.findByWorld(worldId)).sort(
      (a, b) => a.order - b.order,
    );
    if (isPjOrAdmin) return maps;
    const folders = await this.foldersRepo.findByWorld(worldId);
    const visibleFolders = this.visibleFolderIds(folders, userId);
    return maps
      .filter(
        (m) =>
          (m.isPublic ||
            (userId !== null && m.visibleToPlayerIds.includes(userId))) &&
          (m.folderId === null || visibleFolders.has(m.folderId)),
      )
      .map((m) => this.stripForPlayer(m, userId));
  }

  /**
   * 16.5 — leak-safe očištění mapy pro hráče: smaže `visibleToPlayerIds` mapy i
   * pinů a **odfiltruje tajné vlaječky** (pin viditelný jen když
   * `isPublic || visibleToPlayerIds.includes(userId)`).
   */
  private stripForPlayer(
    map: WorldMapEntry,
    userId: string | null,
  ): WorldMapEntry {
    return {
      ...map,
      visibleToPlayerIds: [],
      pins: map.pins
        .filter(
          (p) =>
            p.isPublic ||
            (userId !== null && p.visibleToPlayerIds.includes(userId)),
        )
        .map((p) => ({ ...p, visibleToPlayerIds: [] })),
    };
  }

  async create(worldId: string, dto: CreateMapDto): Promise<WorldMapEntry> {
    const maps = await this.repo.findByWorld(worldId);
    const now = new Date().toISOString();
    const entry: WorldMapEntry = {
      id: randomUUID(),
      folderId: dto.folderId ?? null,
      title: dto.title.trim(),
      description: dto.description?.trim() ?? '',
      imageUrl: dto.imageUrl,
      order: maps.length,
      isPublic: dto.isPublic ?? false,
      visibleToPlayerIds: dto.visibleToPlayerIds ?? [],
      pins: [],
      linkedSceneId: null,
      createdAt: now,
      updatedAt: now,
    };
    return this.repo.addMap(worldId, entry);
  }

  async update(
    worldId: string,
    mapId: string,
    dto: UpdateMapDto,
  ): Promise<WorldMapEntry> {
    // UM-03 — staré imageUrl pro orphan cleanup (před přepsáním).
    const prev = (await this.repo.findByWorld(worldId)).find(
      (m) => m.id === mapId,
    );
    const patch: Partial<WorldMapEntry> = {
      updatedAt: new Date().toISOString(),
    };
    if (dto.title !== undefined) patch.title = dto.title.trim();
    if (dto.description !== undefined)
      patch.description = dto.description.trim();
    if (dto.imageUrl !== undefined) patch.imageUrl = dto.imageUrl;
    if (dto.isPublic !== undefined) patch.isPublic = dto.isPublic;
    if (dto.visibleToPlayerIds !== undefined)
      patch.visibleToPlayerIds = dto.visibleToPlayerIds;
    if (dto.folderId !== undefined) patch.folderId = dto.folderId;
    if (dto.linkedSceneId !== undefined)
      patch.linkedSceneId = dto.linkedSceneId;

    const updated = await this.repo.updateMap(worldId, mapId, patch);
    if (!updated)
      throw new NotFoundException({
        code: 'WORLD_MAP_NOT_FOUND',
        message: 'Mapa nenalezena',
      });
    if (
      dto.imageUrl !== undefined &&
      prev?.imageUrl &&
      prev.imageUrl !== dto.imageUrl
    ) {
      this.eventEmitter.emit('media.orphaned', { urls: [prev.imageUrl] });
    }
    return updated;
  }

  async remove(worldId: string, mapId: string): Promise<void> {
    // UM-05 — staré imageUrl pro orphan cleanup (před smazáním).
    const prev = (await this.repo.findByWorld(worldId)).find(
      (m) => m.id === mapId,
    );
    const ok = await this.repo.removeMap(worldId, mapId);
    if (!ok)
      throw new NotFoundException({
        code: 'WORLD_MAP_NOT_FOUND',
        message: 'Mapa nenalezena',
      });
    if (prev?.imageUrl) {
      this.eventEmitter.emit('media.orphaned', { urls: [prev.imageUrl] });
    }
  }

  async reorder(
    worldId: string,
    orderedIds: string[],
  ): Promise<WorldMapEntry[]> {
    return this.repo.reorder(worldId, orderedIds);
  }

  // ── Vlaječky (16.5) ─────────────────────────────────────────────────────────
  /** Přidá vlaječku na mapu; vrací aktualizovanou mapu (PJ pohled, plné piny). */
  async createPin(
    worldId: string,
    mapId: string,
    dto: CreatePinDto,
  ): Promise<WorldMapEntry> {
    const pin: WorldMapPin = {
      id: randomUUID(),
      x: dto.x,
      y: dto.y,
      label: dto.label?.trim() || 'Bez názvu',
      info: dto.info?.trim() ?? '',
      targetType: (dto.targetType as WorldMapPin['targetType']) ?? 'none',
      targetSlug: dto.targetSlug ?? null,
      targetMapId: dto.targetMapId ?? null,
      icon: dto.icon ?? 'marker',
      color: dto.color ?? 'cyan',
      isPublic: dto.isPublic ?? true,
      visibleToPlayerIds: dto.visibleToPlayerIds ?? [],
    };
    const updated = await this.repo.addPin(
      worldId,
      mapId,
      pin,
      new Date().toISOString(),
    );
    if (!updated)
      throw new NotFoundException({
        code: 'WORLD_MAP_NOT_FOUND',
        message: 'Mapa nenalezena',
      });
    return updated;
  }

  async updatePin(
    worldId: string,
    mapId: string,
    pinId: string,
    dto: UpdatePinDto,
  ): Promise<WorldMapEntry> {
    const patch: Partial<WorldMapPin> = {};
    if (dto.x !== undefined) patch.x = dto.x;
    if (dto.y !== undefined) patch.y = dto.y;
    if (dto.label !== undefined) patch.label = dto.label.trim();
    if (dto.info !== undefined) patch.info = dto.info.trim();
    if (dto.targetType !== undefined)
      patch.targetType = dto.targetType as WorldMapPin['targetType'];
    if (dto.targetSlug !== undefined) patch.targetSlug = dto.targetSlug;
    if (dto.targetMapId !== undefined) patch.targetMapId = dto.targetMapId;
    if (dto.icon !== undefined) patch.icon = dto.icon;
    if (dto.color !== undefined) patch.color = dto.color;
    if (dto.isPublic !== undefined) patch.isPublic = dto.isPublic;
    if (dto.visibleToPlayerIds !== undefined)
      patch.visibleToPlayerIds = dto.visibleToPlayerIds;

    const updated = await this.repo.updatePin(
      worldId,
      mapId,
      pinId,
      patch,
      new Date().toISOString(),
    );
    if (!updated)
      throw new NotFoundException({
        code: 'WORLD_MAP_NOT_FOUND',
        message: 'Mapa nenalezena',
      });
    if (!updated.pins.some((p) => p.id === pinId))
      throw new NotFoundException({
        code: 'WORLD_MAP_PIN_NOT_FOUND',
        message: 'Vlaječka nenalezena',
      });
    return updated;
  }

  async removePin(
    worldId: string,
    mapId: string,
    pinId: string,
  ): Promise<WorldMapEntry> {
    const updated = await this.repo.removePin(
      worldId,
      mapId,
      pinId,
      new Date().toISOString(),
    );
    if (!updated)
      throw new NotFoundException({
        code: 'WORLD_MAP_NOT_FOUND',
        message: 'Mapa nenalezena',
      });
    return updated;
  }

  // ── Složky ────────────────────────────────────────────────────────────────
  async listFolders(
    worldId: string,
    userId: string | null,
    isPjOrAdmin: boolean,
  ): Promise<WorldMapFolder[]> {
    const folders = (await this.foldersRepo.findByWorld(worldId)).sort(
      (a, b) => a.order - b.order,
    );
    if (isPjOrAdmin) return folders;
    const visible = this.visibleFolderIds(folders, userId);
    return folders
      .filter((f) => visible.has(f.id))
      .map((f) => ({ ...f, visibleToPlayerIds: [] }));
  }

  async createFolder(
    worldId: string,
    dto: CreateFolderDto,
  ): Promise<WorldMapFolder> {
    const folders = await this.foldersRepo.findByWorld(worldId);
    const now = new Date().toISOString();
    const folder: WorldMapFolder = {
      id: randomUUID(),
      parentId: dto.parentId ?? null,
      name: dto.name.trim(),
      order: folders.length,
      isPublic: dto.isPublic ?? false,
      visibleToPlayerIds: dto.visibleToPlayerIds ?? [],
      createdAt: now,
      updatedAt: now,
    };
    return this.foldersRepo.create(worldId, folder);
  }

  async updateFolder(
    worldId: string,
    folderId: string,
    dto: UpdateFolderDto,
  ): Promise<WorldMapFolder> {
    // Ochrana proti cyklu — složka nesmí být svým (ne)přímým rodičem.
    if (dto.parentId !== undefined && dto.parentId !== null) {
      if (dto.parentId === folderId)
        throw new BadRequestException({
          code: 'FOLDER_CYCLE',
          message: 'Složka nemůže být svým rodičem',
        });
      const folders = await this.foldersRepo.findByWorld(worldId);
      if (this.isDescendant(folders, dto.parentId, folderId))
        throw new BadRequestException({
          code: 'FOLDER_CYCLE',
          message: 'Nelze přesunout složku do vlastní podsložky',
        });
    }
    const patch: Partial<WorldMapFolder> = {
      updatedAt: new Date().toISOString(),
    };
    if (dto.name !== undefined) patch.name = dto.name.trim();
    if (dto.parentId !== undefined) patch.parentId = dto.parentId;
    if (dto.isPublic !== undefined) patch.isPublic = dto.isPublic;
    if (dto.visibleToPlayerIds !== undefined)
      patch.visibleToPlayerIds = dto.visibleToPlayerIds;

    const updated = await this.foldersRepo.update(worldId, folderId, patch);
    if (!updated)
      throw new NotFoundException({
        code: 'WORLD_MAP_FOLDER_NOT_FOUND',
        message: 'Složka nenalezena',
      });
    return updated;
  }

  /** Je `candidateId` potomkem `ancestorId`? (ochrana proti cyklu při přesunu) */
  private isDescendant(
    folders: WorldMapFolder[],
    candidateId: string,
    ancestorId: string,
  ): boolean {
    const byId = new Map(folders.map((f) => [f.id, f]));
    let cur = byId.get(candidateId);
    while (cur) {
      if (cur.parentId === ancestorId) return true;
      cur = cur.parentId ? byId.get(cur.parentId) : undefined;
    }
    return false;
  }

  async removeFolder(worldId: string, folderId: string): Promise<void> {
    const folders = await this.foldersRepo.findByWorld(worldId);
    const folder = folders.find((f) => f.id === folderId);
    if (!folder)
      throw new NotFoundException({
        code: 'WORLD_MAP_FOLDER_NOT_FOUND',
        message: 'Složka nenalezena',
      });
    // Obsah (podsložky + mapy) přesunout do rodiče smazané složky, nemazat
    // kaskádně — uživatel nepřijde o mapy omylem.
    await this.foldersRepo.reparentChildren(worldId, folderId, folder.parentId);
    await this.repo.reparentMaps(worldId, folderId, folder.parentId);
    await this.foldersRepo.remove(worldId, folderId);
  }

  async reorderFolders(
    worldId: string,
    orderedIds: string[],
  ): Promise<WorldMapFolder[]> {
    return this.foldersRepo.reorder(worldId, orderedIds);
  }
}
