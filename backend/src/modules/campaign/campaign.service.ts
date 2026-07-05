import {
  Injectable,
  Inject,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { WorldRole } from '../worlds/interfaces/world-membership.interface';
import type { RequestUser } from '../../common/interfaces/request-user.interface';
import { worldAdminBypass } from '../../common/utils/world-elevation';
import { escapeRegex } from '../../common/utils/escape-regex';
// UserRole už není potřeba (getWorldRole bere requester: RequestUser).
import type { ICampaignSubjectRepository } from './interfaces/campaign-subject-repository.interface';
import type { ICampaignRelationshipRepository } from './interfaces/campaign-relationship-repository.interface';
import type { ICampaignStorylineRepository } from './interfaces/campaign-storyline-repository.interface';
import type { ICampaignScenarioRepository } from './interfaces/campaign-scenario-repository.interface';
import type { ICampaignQuickNoteRepository } from './interfaces/campaign-quick-note-repository.interface';
import type { ICampaignShopItemRepository } from './interfaces/campaign-shop-item-repository.interface';
import type { ICampaignShopGroupRepository } from './interfaces/campaign-shop-group-repository.interface';
import type { ICampaignChangeLogRepository } from './interfaces/campaign-change-log-repository.interface';
import type { IWorldMembershipRepository } from '../worlds/interfaces/world-membership-repository.interface';
import type { CampaignSubject } from './interfaces/campaign-subject.interface';
import type { CampaignRelationship } from './interfaces/campaign-relationship.interface';
import type { CampaignStoryline } from './interfaces/campaign-storyline.interface';
import type { CampaignScenario } from './interfaces/campaign-scenario.interface';
import type { CampaignQuickNote } from './interfaces/campaign-quick-note.interface';
import type { CampaignShopItem } from './interfaces/campaign-shop-item.interface';
import type { CampaignShopGroup } from './interfaces/campaign-shop-group.interface';
import type {
  CampaignEntityType,
  CampaignChangeType,
} from './interfaces/campaign-change-log.interface';

interface EntityBase {
  id: string;
  worldId: string;
  ownerId: string;
  isShared: boolean;
}

@Injectable()
export class CampaignService {
  constructor(
    @Inject('ICampaignSubjectRepository')
    private readonly subjectRepo: ICampaignSubjectRepository,
    @Inject('ICampaignRelationshipRepository')
    private readonly relRepo: ICampaignRelationshipRepository,
    @Inject('ICampaignStorylineRepository')
    private readonly storylineRepo: ICampaignStorylineRepository,
    @Inject('ICampaignScenarioRepository')
    private readonly scenarioRepo: ICampaignScenarioRepository,
    @Inject('ICampaignQuickNoteRepository')
    private readonly noteRepo: ICampaignQuickNoteRepository,
    @Inject('ICampaignShopItemRepository')
    private readonly shopRepo: ICampaignShopItemRepository,
    @Inject('ICampaignShopGroupRepository')
    private readonly shopGroupRepo: ICampaignShopGroupRepository,
    @Inject('ICampaignChangeLogRepository')
    private readonly logRepo: ICampaignChangeLogRepository,
    @Inject('IWorldMembershipRepository')
    private readonly membershipRepo: IWorldMembershipRepository,
  ) {}

  // ── Helpers ──────────────────────────────────────────────────────────────

  async getWorldRole(
    requester: RequestUser,
    worldId: string,
  ): Promise<WorldRole> {
    // World elevation — platform Admin/Sa má bypass (→ PJ) JEN když je pro
    // tento svět elevovaný; de-elevated admin spadne na svou membership roli.
    if (worldAdminBypass(requester, worldId)) return WorldRole.PJ;
    const membership = await this.membershipRepo.findByUserAndWorld(
      requester.id,
      worldId,
    );
    // N-06 (nav-audit) — nečlen NESMÍ číst/psát kampaňová data světa. Dřív
    // fallback na `WorldRole.Hrac` → kdokoli přihlášený (i mimo svět) prošel
    // přes `role()` a mohl přes přímé API zakládat scénáře/subjekty/storyline
    // do cizího světa (create endpointy nemají role floor; gate je jen scope).
    if (!membership) {
      throw new ForbiddenException({
        code: 'NOT_A_MEMBER',
        message: 'Nejsi členem tohoto světa',
      });
    }
    return membership.role;
  }

  resolveScope(
    userId: string,
    worldRole: WorldRole,
    worldId: string,
  ): Record<string, unknown> {
    if (worldRole >= WorldRole.PJ) return { worldId };
    if (worldRole === WorldRole.PomocnyPJ)
      return { worldId, $or: [{ ownerId: userId }, { isShared: true }] };
    return { worldId, ownerId: userId };
  }

  /**
   * N-22 — scope pro OBCHOD (shop items/groups). Na rozdíl od ostatních
   * campaign nástrojů (storyboard, pavučina) je obchod určen hráčům: hráč /
   * Čtenář / Korektor vidí `isShared` (PJ-publikované) položky, ne jen vlastní
   * (které stejně netvoří). PJ+ má plný scope přes `resolveScope`.
   */
  resolveShopScope(
    userId: string,
    worldRole: WorldRole,
    worldId: string,
  ): Record<string, unknown> {
    if (worldRole >= WorldRole.PomocnyPJ)
      return this.resolveScope(userId, worldRole, worldId);
    return { worldId, isShared: true };
  }

  canModify(entity: EntityBase, userId: string, worldRole: WorldRole): boolean {
    if (worldRole >= WorldRole.PJ) return true;
    if (entity.isShared && worldRole >= WorldRole.PomocnyPJ) return true;
    return entity.ownerId === userId;
  }

  private logChange(
    entity: EntityBase,
    entityType: CampaignEntityType,
    entityName: string,
    changeType: CampaignChangeType,
    changedByUserId: string,
    changedByName: string,
  ): void {
    this.logRepo
      .append({
        worldId: entity.worldId,
        ownerId: entity.ownerId,
        isShared: entity.isShared,
        entityType,
        entityId: entity.id,
        entityName,
        changeType,
        changedByUserId,
        changedByName,
        changedAt: new Date(),
      })
      .catch(() => {
        /* fire-and-forget */
      });
  }

  // ── Subjects ─────────────────────────────────────────────────────────────

  async findSubjects(
    userId: string,
    worldRole: WorldRole,
    worldId: string,
    filters: { type?: string; status?: string; q?: string },
  ): Promise<CampaignSubject[]> {
    const base = this.resolveScope(userId, worldRole, worldId);
    if (filters.type) base['type'] = filters.type;
    if (filters.status) base['status'] = filters.status;
    if (filters.q)
      base['name'] = { $regex: escapeRegex(filters.q), $options: 'i' };
    return this.subjectRepo.findMany(base);
  }

  async findSubjectById(
    id: string,
    userId: string,
    worldRole: WorldRole,
  ): Promise<CampaignSubject> {
    const entity = await this.subjectRepo.findById(id);
    if (!entity)
      throw new NotFoundException({
        code: 'CAMPAIGN_SUBJECT_NOT_FOUND',
        message: 'Subjekt nenalezen',
      });
    if (!this.canModify(entity, userId, worldRole))
      throw new ForbiddenException({
        code: 'CAMPAIGN_FORBIDDEN',
        message: 'Tohle je vyhrazené — vidí to jen autor nebo PJ.',
      });
    return entity;
  }

  async createSubject(
    userId: string,
    userName: string,
    worldRole: WorldRole,
    worldId: string,
    isShared: boolean,
    dto: {
      name: string;
      type?: CampaignSubject['type'];
      avatarUrl?: string;
      tags?: string[];
      status?: CampaignSubject['status'];
      linkedPageSlug?: string;
      linkedCharacterSlug?: string;
      notes?: string;
    },
  ): Promise<CampaignSubject> {
    const created = await this.subjectRepo.create({
      worldId,
      ownerId: userId,
      isShared,
      type: dto.type ?? 'NPC',
      name: dto.name,
      avatarUrl: dto.avatarUrl,
      tags: dto.tags ?? [],
      status: dto.status ?? 'active',
      linkedPageSlug: dto.linkedPageSlug,
      linkedCharacterSlug: dto.linkedCharacterSlug,
      notes: dto.notes,
    });
    this.logChange(
      created,
      'subject',
      created.name,
      'created',
      userId,
      userName,
    );
    return created;
  }

  async updateSubject(
    id: string,
    userId: string,
    userName: string,
    worldRole: WorldRole,
    dto: Partial<
      Omit<
        CampaignSubject,
        'id' | 'worldId' | 'ownerId' | 'isShared' | 'createdAt' | 'updatedAt'
      >
    >,
  ): Promise<CampaignSubject> {
    const existing = await this.subjectRepo.findById(id);
    if (!existing)
      throw new NotFoundException({
        code: 'CAMPAIGN_SUBJECT_NOT_FOUND',
        message: 'Subjekt nenalezen',
      });
    if (!this.canModify(existing, userId, worldRole))
      throw new ForbiddenException({
        code: 'CAMPAIGN_FORBIDDEN',
        message: 'Upravit to může jen autor nebo PJ.',
      });
    const updated = await this.subjectRepo.update(id, dto);
    if (!updated)
      throw new NotFoundException({
        code: 'CAMPAIGN_SUBJECT_NOT_FOUND',
        message: 'Subjekt nenalezen',
      });
    this.logChange(
      updated,
      'subject',
      updated.name,
      'updated',
      userId,
      userName,
    );
    return updated;
  }

  async deleteSubject(
    id: string,
    userId: string,
    worldRole: WorldRole,
    userName: string,
  ): Promise<void> {
    const existing = await this.subjectRepo.findById(id);
    if (!existing)
      throw new NotFoundException({
        code: 'CAMPAIGN_SUBJECT_NOT_FOUND',
        message: 'Subjekt nenalezen',
      });
    if (!this.canModify(existing, userId, worldRole))
      throw new ForbiddenException({
        code: 'CAMPAIGN_FORBIDDEN',
        message: 'Upravit to může jen autor nebo PJ.',
      });
    await this.subjectRepo.delete(id);
    await this.relRepo.deleteBySubjectId(id);
    this.logChange(
      existing,
      'subject',
      existing.name,
      'deleted',
      userId,
      userName,
    );
  }

  // ── Relationships ─────────────────────────────────────────────────────────

  async findRelationships(
    userId: string,
    worldRole: WorldRole,
    worldId: string,
    filters: { subjectId?: string; status?: string; storylineId?: string },
  ): Promise<CampaignRelationship[]> {
    const base = this.resolveScope(userId, worldRole, worldId);
    if (filters.status) base['status'] = filters.status;
    if (filters.storylineId) base['storylineIds'] = filters.storylineId;
    if (filters.subjectId) {
      base['$or'] = [
        { subjectAId: filters.subjectId },
        { subjectBId: filters.subjectId },
      ];
    }
    return this.relRepo.findMany(base);
  }

  async findRelationshipById(
    id: string,
    userId: string,
    worldRole: WorldRole,
  ): Promise<CampaignRelationship> {
    const entity = await this.relRepo.findById(id);
    if (!entity)
      throw new NotFoundException({
        code: 'CAMPAIGN_RELATION_NOT_FOUND',
        message: 'Vztah nenalezen',
      });
    if (!this.canModify(entity, userId, worldRole))
      throw new ForbiddenException({
        code: 'CAMPAIGN_FORBIDDEN',
        message: 'Tohle je vyhrazené — vidí to jen autor nebo PJ.',
      });
    return entity;
  }

  async createRelationship(
    userId: string,
    userName: string,
    worldRole: WorldRole,
    worldId: string,
    isShared: boolean,
    dto: {
      subjectAId: string;
      subjectBId: string;
      shared?: CampaignRelationship['shared'];
      sideA?: Partial<CampaignRelationship['sideA']>;
      sideB?: Partial<CampaignRelationship['sideB']>;
      status?: CampaignRelationship['status'];
      priority?: number;
      storylineIds?: string[];
      lastChangeNote?: string;
    },
  ): Promise<CampaignRelationship> {
    const created = await this.relRepo.create({
      worldId,
      ownerId: userId,
      isShared,
      subjectAId: dto.subjectAId,
      subjectBId: dto.subjectBId,
      shared: dto.shared ?? {},
      sideA: { strength: 5, ...dto.sideA },
      sideB: { strength: 5, ...dto.sideB },
      status: dto.status ?? 'active',
      priority: dto.priority ?? 3,
      storylineIds: dto.storylineIds ?? [],
      lastChangeNote: dto.lastChangeNote,
    });
    this.logChange(
      created,
      'relationship',
      `${created.subjectAId}↔${created.subjectBId}`,
      'created',
      userId,
      userName,
    );
    return created;
  }

  async updateRelationship(
    id: string,
    userId: string,
    userName: string,
    worldRole: WorldRole,
    dto: Partial<
      Omit<
        CampaignRelationship,
        'id' | 'worldId' | 'ownerId' | 'isShared' | 'createdAt' | 'updatedAt'
      >
    >,
  ): Promise<CampaignRelationship> {
    const existing = await this.relRepo.findById(id);
    if (!existing)
      throw new NotFoundException({
        code: 'CAMPAIGN_RELATION_NOT_FOUND',
        message: 'Vztah nenalezen',
      });
    if (!this.canModify(existing, userId, worldRole))
      throw new ForbiddenException({
        code: 'CAMPAIGN_FORBIDDEN',
        message: 'Upravit to může jen autor nebo PJ.',
      });
    const updated = await this.relRepo.update(id, dto);
    if (!updated)
      throw new NotFoundException({
        code: 'CAMPAIGN_RELATION_NOT_FOUND',
        message: 'Vztah nenalezen',
      });
    this.logChange(
      updated,
      'relationship',
      `${updated.subjectAId}↔${updated.subjectBId}`,
      'updated',
      userId,
      userName,
    );
    return updated;
  }

  async deleteRelationship(
    id: string,
    userId: string,
    worldRole: WorldRole,
    userName: string,
  ): Promise<void> {
    const existing = await this.relRepo.findById(id);
    if (!existing)
      throw new NotFoundException({
        code: 'CAMPAIGN_RELATION_NOT_FOUND',
        message: 'Vztah nenalezen',
      });
    if (!this.canModify(existing, userId, worldRole))
      throw new ForbiddenException({
        code: 'CAMPAIGN_FORBIDDEN',
        message: 'Upravit to může jen autor nebo PJ.',
      });
    await this.relRepo.delete(id);
    this.logChange(
      existing,
      'relationship',
      `${existing.subjectAId}↔${existing.subjectBId}`,
      'deleted',
      userId,
      userName,
    );
  }

  // ── Storylines ────────────────────────────────────────────────────────────

  async findStorylines(
    userId: string,
    worldRole: WorldRole,
    worldId: string,
    filters: { level?: string; status?: string; subjectId?: string },
  ): Promise<CampaignStoryline[]> {
    const base = this.resolveScope(userId, worldRole, worldId);
    if (filters.level) base['level'] = filters.level;
    if (filters.status) base['status'] = filters.status;
    if (filters.subjectId) base['subjectIds'] = filters.subjectId;
    return this.storylineRepo.findMany(base);
  }

  async findStorylineById(
    id: string,
    userId: string,
    worldRole: WorldRole,
  ): Promise<CampaignStoryline> {
    const entity = await this.storylineRepo.findById(id);
    if (!entity)
      throw new NotFoundException({
        code: 'CAMPAIGN_STORYLINE_NOT_FOUND',
        message: 'Storyline nenalezena',
      });
    if (!this.canModify(entity, userId, worldRole))
      throw new ForbiddenException({
        code: 'CAMPAIGN_FORBIDDEN',
        message: 'Tohle je vyhrazené — vidí to jen autor nebo PJ.',
      });
    return entity;
  }

  async createStoryline(
    userId: string,
    userName: string,
    worldRole: WorldRole,
    worldId: string,
    isShared: boolean,
    dto: {
      title: string;
      level?: CampaignStoryline['level'];
      status?: CampaignStoryline['status'];
      phase?: string;
      summary?: string;
      whatHappened?: string;
      truth?: string;
      playersBelief?: string;
      gmIntent?: string;
      nextStep?: string;
      subjectIds?: string[];
      relationshipIds?: string[];
    },
  ): Promise<CampaignStoryline> {
    const created = await this.storylineRepo.create({
      worldId,
      ownerId: userId,
      isShared,
      title: dto.title,
      level: dto.level ?? 'mid',
      status: dto.status ?? 'active',
      phase: dto.phase,
      summary: dto.summary,
      whatHappened: dto.whatHappened,
      truth: dto.truth,
      playersBelief: dto.playersBelief,
      gmIntent: dto.gmIntent,
      nextStep: dto.nextStep,
      subjectIds: dto.subjectIds ?? [],
      relationshipIds: dto.relationshipIds ?? [],
    });
    this.logChange(
      created,
      'storyline',
      created.title,
      'created',
      userId,
      userName,
    );
    return created;
  }

  async updateStoryline(
    id: string,
    userId: string,
    userName: string,
    worldRole: WorldRole,
    dto: Partial<
      Omit<
        CampaignStoryline,
        'id' | 'worldId' | 'ownerId' | 'isShared' | 'createdAt' | 'updatedAt'
      >
    >,
  ): Promise<CampaignStoryline> {
    const existing = await this.storylineRepo.findById(id);
    if (!existing)
      throw new NotFoundException({
        code: 'CAMPAIGN_STORYLINE_NOT_FOUND',
        message: 'Storyline nenalezena',
      });
    if (!this.canModify(existing, userId, worldRole))
      throw new ForbiddenException({
        code: 'CAMPAIGN_FORBIDDEN',
        message: 'Upravit to může jen autor nebo PJ.',
      });
    const updated = await this.storylineRepo.update(id, dto);
    if (!updated)
      throw new NotFoundException({
        code: 'CAMPAIGN_STORYLINE_NOT_FOUND',
        message: 'Storyline nenalezena',
      });
    this.logChange(
      updated,
      'storyline',
      updated.title,
      'updated',
      userId,
      userName,
    );
    return updated;
  }

  async deleteStoryline(
    id: string,
    userId: string,
    worldRole: WorldRole,
    userName: string,
  ): Promise<void> {
    const existing = await this.storylineRepo.findById(id);
    if (!existing)
      throw new NotFoundException({
        code: 'CAMPAIGN_STORYLINE_NOT_FOUND',
        message: 'Storyline nenalezena',
      });
    if (!this.canModify(existing, userId, worldRole))
      throw new ForbiddenException({
        code: 'CAMPAIGN_FORBIDDEN',
        message: 'Upravit to může jen autor nebo PJ.',
      });
    await this.storylineRepo.delete(id);
    this.logChange(
      existing,
      'storyline',
      existing.title,
      'deleted',
      userId,
      userName,
    );
  }

  // ── Scenarios ─────────────────────────────────────────────────────────────

  async findScenarios(
    userId: string,
    worldRole: WorldRole,
    worldId: string,
  ): Promise<CampaignScenario[]> {
    const base = this.resolveScope(userId, worldRole, worldId);
    return this.scenarioRepo.findMany(base, { order: 1 });
  }

  async findScenarioById(
    id: string,
    userId: string,
    worldRole: WorldRole,
  ): Promise<CampaignScenario> {
    const entity = await this.scenarioRepo.findById(id);
    if (!entity)
      throw new NotFoundException({
        code: 'CAMPAIGN_SCENE_NOT_FOUND',
        message: 'Scénář nenalezen',
      });
    if (!this.canModify(entity, userId, worldRole))
      throw new ForbiddenException({
        code: 'CAMPAIGN_FORBIDDEN',
        message: 'Tohle je vyhrazené — vidí to jen autor nebo PJ.',
      });
    return entity;
  }

  async createScenario(
    userId: string,
    userName: string,
    worldRole: WorldRole,
    worldId: string,
    isShared: boolean,
    dto: {
      title: string;
      contentData?: Record<string, unknown>;
      linkedPageSlug?: string;
      subjectIds?: string[];
      storylineIds?: string[];
      images?: string[];
    },
  ): Promise<CampaignScenario> {
    const scopeFilter = { worldId, ownerId: userId, isShared };
    const maxOrder = await this.scenarioRepo.maxOrder(scopeFilter);
    const created = await this.scenarioRepo.create({
      worldId,
      ownerId: userId,
      isShared,
      title: dto.title,
      contentData: dto.contentData,
      order: maxOrder + 1,
      linkedPageSlug: dto.linkedPageSlug,
      subjectIds: dto.subjectIds ?? [],
      storylineIds: dto.storylineIds ?? [],
      images: dto.images ?? [],
    });
    this.logChange(
      created,
      'scenario',
      created.title,
      'created',
      userId,
      userName,
    );
    return created;
  }

  async updateScenario(
    id: string,
    userId: string,
    userName: string,
    worldRole: WorldRole,
    dto: Partial<
      Omit<
        CampaignScenario,
        'id' | 'worldId' | 'ownerId' | 'isShared' | 'createdAt' | 'updatedAt'
      >
    >,
  ): Promise<CampaignScenario> {
    const existing = await this.scenarioRepo.findById(id);
    if (!existing)
      throw new NotFoundException({
        code: 'CAMPAIGN_SCENE_NOT_FOUND',
        message: 'Scénář nenalezen',
      });
    if (!this.canModify(existing, userId, worldRole))
      throw new ForbiddenException({
        code: 'CAMPAIGN_FORBIDDEN',
        message: 'Upravit to může jen autor nebo PJ.',
      });
    const updated = await this.scenarioRepo.update(id, dto);
    if (!updated)
      throw new NotFoundException({
        code: 'CAMPAIGN_SCENE_NOT_FOUND',
        message: 'Scénář nenalezen',
      });
    this.logChange(
      updated,
      'scenario',
      updated.title,
      'updated',
      userId,
      userName,
    );
    return updated;
  }

  async deleteScenario(
    id: string,
    userId: string,
    worldRole: WorldRole,
    userName: string,
  ): Promise<void> {
    const existing = await this.scenarioRepo.findById(id);
    if (!existing)
      throw new NotFoundException({
        code: 'CAMPAIGN_SCENE_NOT_FOUND',
        message: 'Scénář nenalezen',
      });
    if (!this.canModify(existing, userId, worldRole))
      throw new ForbiddenException({
        code: 'CAMPAIGN_FORBIDDEN',
        message: 'Upravit to může jen autor nebo PJ.',
      });
    await this.scenarioRepo.delete(id);
    this.logChange(
      existing,
      'scenario',
      existing.title,
      'deleted',
      userId,
      userName,
    );
  }

  // ── QuickNotes ────────────────────────────────────────────────────────────

  async findQuickNotes(
    userId: string,
    worldRole: WorldRole,
    worldId: string,
    filters: { status?: string; pinned?: boolean },
  ): Promise<CampaignQuickNote[]> {
    const base = this.resolveScope(userId, worldRole, worldId);
    if (filters.status) base['status'] = filters.status;
    if (filters.pinned !== undefined) base['pinned'] = filters.pinned;
    return this.noteRepo.findMany(base);
  }

  async findQuickNoteById(
    id: string,
    userId: string,
    worldRole: WorldRole,
  ): Promise<CampaignQuickNote> {
    const entity = await this.noteRepo.findById(id);
    if (!entity)
      throw new NotFoundException({
        code: 'CAMPAIGN_NOTE_NOT_FOUND',
        message: 'Poznámka nenalezena',
      });
    if (!this.canModify(entity, userId, worldRole))
      throw new ForbiddenException({
        code: 'CAMPAIGN_FORBIDDEN',
        message: 'Tohle je vyhrazené — vidí to jen autor nebo PJ.',
      });
    return entity;
  }

  async createQuickNote(
    userId: string,
    userName: string,
    worldRole: WorldRole,
    worldId: string,
    isShared: boolean,
    dto: {
      title: string;
      body?: string;
      status?: CampaignQuickNote['status'];
      pinned?: boolean;
      subjectIds?: string[];
      storylineIds?: string[];
    },
  ): Promise<CampaignQuickNote> {
    const created = await this.noteRepo.create({
      worldId,
      ownerId: userId,
      isShared,
      title: dto.title,
      body: dto.body,
      status: dto.status ?? 'open',
      pinned: dto.pinned ?? false,
      subjectIds: dto.subjectIds ?? [],
      storylineIds: dto.storylineIds ?? [],
    });
    this.logChange(
      created,
      'quicknote',
      created.title,
      'created',
      userId,
      userName,
    );
    return created;
  }

  async updateQuickNote(
    id: string,
    userId: string,
    userName: string,
    worldRole: WorldRole,
    dto: Partial<
      Omit<
        CampaignQuickNote,
        'id' | 'worldId' | 'ownerId' | 'isShared' | 'createdAt' | 'updatedAt'
      >
    >,
  ): Promise<CampaignQuickNote> {
    const existing = await this.noteRepo.findById(id);
    if (!existing)
      throw new NotFoundException({
        code: 'CAMPAIGN_NOTE_NOT_FOUND',
        message: 'Poznámka nenalezena',
      });
    if (!this.canModify(existing, userId, worldRole))
      throw new ForbiddenException({
        code: 'CAMPAIGN_FORBIDDEN',
        message: 'Upravit to může jen autor nebo PJ.',
      });
    const updated = await this.noteRepo.update(id, dto);
    if (!updated)
      throw new NotFoundException({
        code: 'CAMPAIGN_NOTE_NOT_FOUND',
        message: 'Poznámka nenalezena',
      });
    this.logChange(
      updated,
      'quicknote',
      updated.title,
      'updated',
      userId,
      userName,
    );
    return updated;
  }

  async deleteQuickNote(
    id: string,
    userId: string,
    worldRole: WorldRole,
    userName: string,
  ): Promise<void> {
    const existing = await this.noteRepo.findById(id);
    if (!existing)
      throw new NotFoundException({
        code: 'CAMPAIGN_NOTE_NOT_FOUND',
        message: 'Poznámka nenalezena',
      });
    if (!this.canModify(existing, userId, worldRole))
      throw new ForbiddenException({
        code: 'CAMPAIGN_FORBIDDEN',
        message: 'Upravit to může jen autor nebo PJ.',
      });
    await this.noteRepo.delete(id);
    this.logChange(
      existing,
      'quicknote',
      existing.title,
      'deleted',
      userId,
      userName,
    );
  }

  // ── ShopItems ─────────────────────────────────────────────────────────────

  async findShopItems(
    userId: string,
    worldRole: WorldRole,
    worldId: string,
    filters: { groupId?: string },
  ): Promise<CampaignShopItem[]> {
    const base = this.resolveShopScope(userId, worldRole, worldId);
    if (filters.groupId)
      base['$and'] = [
        {
          $or: [{ groupId: filters.groupId }, { subgroupId: filters.groupId }],
        },
      ];
    return this.shopRepo.findMany(base);
  }

  async findShopItemById(
    id: string,
    userId: string,
    worldRole: WorldRole,
  ): Promise<CampaignShopItem> {
    const entity = await this.shopRepo.findById(id);
    if (!entity)
      throw new NotFoundException({
        code: 'CAMPAIGN_ITEM_NOT_FOUND',
        message: 'Položka nenalezena',
      });
    if (!this.canModify(entity, userId, worldRole))
      throw new ForbiddenException({
        code: 'CAMPAIGN_FORBIDDEN',
        message: 'Tohle je vyhrazené — vidí to jen autor nebo PJ.',
      });
    return entity;
  }

  async createShopItem(
    userId: string,
    userName: string,
    worldRole: WorldRole,
    worldId: string,
    isShared: boolean,
    dto: {
      name: string;
      description?: string;
      groupId?: string;
      subgroupId?: string;
      price?: number;
      currencyCode?: string;
      discountPercent?: number;
      linkedItemIds?: string[];
      referenceLink?: string;
      isRecommended?: boolean;
    },
  ): Promise<CampaignShopItem> {
    const created = await this.shopRepo.create({
      worldId,
      ownerId: userId,
      isShared,
      name: dto.name,
      description: dto.description,
      groupId: dto.groupId ?? '',
      subgroupId: dto.subgroupId,
      price: dto.price ?? 0,
      currencyCode: dto.currencyCode ?? '',
      discountPercent: dto.discountPercent ?? 0,
      linkedItemIds: dto.linkedItemIds ?? [],
      referenceLink: dto.referenceLink,
      isRecommended: dto.isRecommended ?? false,
    });
    this.logChange(
      created,
      'shopitem',
      created.name,
      'created',
      userId,
      userName,
    );
    return created;
  }

  async updateShopItem(
    id: string,
    userId: string,
    userName: string,
    worldRole: WorldRole,
    dto: Partial<
      Omit<
        CampaignShopItem,
        'id' | 'worldId' | 'ownerId' | 'isShared' | 'createdAt' | 'updatedAt'
      >
    >,
  ): Promise<CampaignShopItem> {
    const existing = await this.shopRepo.findById(id);
    if (!existing)
      throw new NotFoundException({
        code: 'CAMPAIGN_ITEM_NOT_FOUND',
        message: 'Položka nenalezena',
      });
    if (!this.canModify(existing, userId, worldRole))
      throw new ForbiddenException({
        code: 'CAMPAIGN_FORBIDDEN',
        message: 'Upravit to může jen autor nebo PJ.',
      });
    const updated = await this.shopRepo.update(id, dto);
    if (!updated)
      throw new NotFoundException({
        code: 'CAMPAIGN_ITEM_NOT_FOUND',
        message: 'Položka nenalezen',
      });
    this.logChange(
      updated,
      'shopitem',
      updated.name,
      'updated',
      userId,
      userName,
    );
    return updated;
  }

  async deleteShopItem(
    id: string,
    userId: string,
    worldRole: WorldRole,
    userName: string,
  ): Promise<void> {
    const existing = await this.shopRepo.findById(id);
    if (!existing)
      throw new NotFoundException({
        code: 'CAMPAIGN_ITEM_NOT_FOUND',
        message: 'Položka nenalezena',
      });
    if (!this.canModify(existing, userId, worldRole))
      throw new ForbiddenException({
        code: 'CAMPAIGN_FORBIDDEN',
        message: 'Upravit to může jen autor nebo PJ.',
      });
    await this.shopRepo.delete(id);
    await this.shopRepo.pullLinkedItem(existing.worldId, id);
    this.logChange(
      existing,
      'shopitem',
      existing.name,
      'deleted',
      userId,
      userName,
    );
  }

  // ── ShopGroups (typy / skupiny) ───────────────────────────────────────────

  async findShopGroups(
    userId: string,
    worldRole: WorldRole,
    worldId: string,
  ): Promise<CampaignShopGroup[]> {
    const base = this.resolveShopScope(userId, worldRole, worldId);
    return this.shopGroupRepo.findMany(base);
  }

  async createShopGroup(
    userId: string,
    userName: string,
    worldRole: WorldRole,
    worldId: string,
    isShared: boolean,
    dto: {
      name: string;
      parentId?: string;
      order?: number;
      discountPercent?: number;
    },
  ): Promise<CampaignShopGroup> {
    const created = await this.shopGroupRepo.create({
      worldId,
      ownerId: userId,
      isShared,
      name: dto.name,
      parentId: dto.parentId,
      order: dto.order ?? 0,
      discountPercent: dto.discountPercent ?? 0,
    });
    this.logChange(
      created,
      'shopgroup',
      created.name,
      'created',
      userId,
      userName,
    );
    return created;
  }

  async updateShopGroup(
    id: string,
    userId: string,
    userName: string,
    worldRole: WorldRole,
    dto: Partial<
      Omit<
        CampaignShopGroup,
        'id' | 'worldId' | 'ownerId' | 'isShared' | 'createdAt' | 'updatedAt'
      >
    >,
  ): Promise<CampaignShopGroup> {
    const existing = await this.shopGroupRepo.findById(id);
    if (!existing)
      throw new NotFoundException({
        code: 'CAMPAIGN_SHOPGROUP_NOT_FOUND',
        message: 'Skupina nenalezena',
      });
    if (!this.canModify(existing, userId, worldRole))
      throw new ForbiddenException({
        code: 'CAMPAIGN_FORBIDDEN',
        message: 'Upravit to může jen autor nebo PJ.',
      });
    const updated = await this.shopGroupRepo.update(id, dto);
    if (!updated)
      throw new NotFoundException({
        code: 'CAMPAIGN_SHOPGROUP_NOT_FOUND',
        message: 'Skupina nenalezena',
      });
    this.logChange(
      updated,
      'shopgroup',
      updated.name,
      'updated',
      userId,
      userName,
    );
    return updated;
  }

  async deleteShopGroup(
    id: string,
    userId: string,
    worldRole: WorldRole,
    userName: string,
  ): Promise<void> {
    const existing = await this.shopGroupRepo.findById(id);
    if (!existing)
      throw new NotFoundException({
        code: 'CAMPAIGN_SHOPGROUP_NOT_FOUND',
        message: 'Skupina nenalezena',
      });
    if (!this.canModify(existing, userId, worldRole))
      throw new ForbiddenException({
        code: 'CAMPAIGN_FORBIDDEN',
        message: 'Upravit to může jen autor nebo PJ.',
      });
    // Guard: neprázdná skupina (položky nebo podskupiny) — nemazat naslepo
    const itemCount = await this.shopRepo.countByGroup(existing.worldId, id);
    const childCount = await this.shopGroupRepo.countChildren(
      existing.worldId,
      id,
    );
    if (itemCount > 0 || childCount > 0)
      throw new ConflictException({
        code: 'CAMPAIGN_SHOPGROUP_NOT_EMPTY',
        message: 'Skupina obsahuje položky nebo podskupiny',
        itemCount,
        childCount,
      });
    await this.shopGroupRepo.delete(id);
    this.logChange(
      existing,
      'shopgroup',
      existing.name,
      'deleted',
      userId,
      userName,
    );
  }

  // ── Players ───────────────────────────────────────────────────────────────

  async getPlayers(requestingUserId: string, worldId: string) {
    const memberships = await this.membershipRepo.findByWorldId(worldId);
    return memberships
      .filter((m) => m.role >= WorldRole.Hrac && m.userId !== requestingUserId)
      .map((m) => ({
        userId: m.userId,
        characterPath: m.characterPath,
        role: m.role,
      }));
  }

  // ── Changelog & Dashboard ─────────────────────────────────────────────────

  async getChangelog(
    worldId: string,
    worldRole: WorldRole,
    limit = 50,
    userId?: string,
  ) {
    const filter: Record<string, unknown> = { worldId };
    if (worldRole === WorldRole.PomocnyPJ) {
      filter['$or'] = [{ ownerId: userId }, { isShared: true }];
    } else if (worldRole < WorldRole.PomocnyPJ) {
      filter['ownerId'] = userId;
    }
    return this.logRepo.findMany(filter, limit);
  }

  async getDashboard(userId: string, worldRole: WorldRole, worldId: string) {
    const scope = this.resolveScope(userId, worldRole, worldId);
    const [crisisRelationships, activeStorylines, pinnedNotes, recentChanges] =
      await Promise.all([
        this.relRepo.findMany({ ...scope, status: 'crisis' }),
        this.storylineRepo.findMany({ ...scope, status: 'active' }),
        this.noteRepo.findMany({ ...scope, pinned: true, status: 'open' }),
        this.getChangelog(worldId, worldRole, 20, userId),
      ]);
    return {
      crisisRelationships: crisisRelationships.slice(0, 10),
      activeStorylines,
      pinnedNotes,
      recentChanges,
    };
  }
}
