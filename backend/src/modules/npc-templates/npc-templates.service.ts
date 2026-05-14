import {
  Injectable,
  Inject,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import type { INpcTemplatesRepository } from './interfaces/npc-templates-repository.interface';
import type { IWorldMembershipRepository } from '../worlds/interfaces/world-membership-repository.interface';
import type { NpcTemplate } from './interfaces/npc-template.interface';
import { WorldRole } from '../worlds/interfaces/world-membership.interface';
import { UserRole } from '../users/interfaces/user.interface';

export interface CreateNpcTemplateInput {
  originTemplateId?: string;
  name: string;
  imageUrl?: string;
  notes?: string;
  maxHp?: number;
  armor?: number;
  injury?: number;
  movement?: number;
  initiativeBase?: number;
  abilities?: { label: string; value: string }[];
  diarySchema?: Record<string, unknown>[];
  diaryData?: Record<string, unknown>;
}

@Injectable()
export class NpcTemplatesService {
  constructor(
    @Inject('INpcTemplatesRepository')
    private readonly repo: INpcTemplatesRepository,
    @Inject('IWorldMembershipRepository')
    private readonly membershipRepo: IWorldMembershipRepository,
  ) {}

  async assertCanManage(
    userId: string,
    userRole: UserRole,
    worldId: string,
  ): Promise<void> {
    if (userRole <= UserRole.Admin) return;
    const membership = await this.membershipRepo.findByUserAndWorld(
      userId,
      worldId,
    );
    if (!membership || membership.role < WorldRole.PJ)
      throw new ForbiddenException('Nedostatečná oprávnění');
  }

  async findAll(worldId: string): Promise<NpcTemplate[]> {
    return this.repo.findByWorld(worldId);
  }

  async findGlobal(): Promise<NpcTemplate[]> {
    return this.repo.findGlobal();
  }

  async findOne(id: string, worldId: string): Promise<NpcTemplate> {
    const template = await this.repo.findById(id);
    if (!template || template.worldId !== worldId)
      throw new NotFoundException('NPC šablona nenalezena');
    return template;
  }

  async create(
    dto: CreateNpcTemplateInput,
    worldId: string,
  ): Promise<NpcTemplate> {
    return this.repo.create({
      worldId,
      name: dto.name,
      imageUrl: dto.imageUrl,
      notes: dto.notes ?? '',
      maxHp: dto.maxHp ?? 5,
      armor: dto.armor ?? 0,
      injury: dto.injury ?? 0,
      movement: dto.movement ?? 5,
      initiativeBase: dto.initiativeBase ?? 0,
      abilities: dto.abilities ?? [],
      diarySchema:
        (dto.diarySchema as unknown as NpcTemplate['diarySchema']) ?? [],
      diaryData: dto.diaryData ?? {},
    });
  }

  async update(
    id: string,
    worldId: string,
    dto: Partial<CreateNpcTemplateInput>,
  ): Promise<NpcTemplate> {
    const result = await this.repo.updateByIdAndWorld(
      id,
      worldId,
      dto as Partial<NpcTemplate>,
    );
    if (!result) throw new NotFoundException('NPC šablona nenalezena');
    return result;
  }

  async remove(id: string, worldId: string): Promise<void> {
    const deleted = await this.repo.deleteByIdAndWorld(id, worldId);
    if (!deleted) throw new NotFoundException('NPC šablona nenalezena');
  }

  async importToWorld(
    templateId: string,
    worldId: string,
  ): Promise<NpcTemplate> {
    const tpl = await this.repo.findById(templateId);
    if (!tpl) throw new NotFoundException('Globální šablona nenalezena');
    return this.repo.create({
      worldId,
      originTemplateId: templateId,
      name: tpl.name,
      imageUrl: tpl.imageUrl,
      notes: tpl.notes,
      maxHp: tpl.maxHp,
      armor: tpl.armor,
      injury: tpl.injury,
      movement: tpl.movement,
      initiativeBase: tpl.initiativeBase,
      abilities: tpl.abilities,
      diarySchema: tpl.diarySchema,
      diaryData: tpl.diaryData,
    });
  }
}
