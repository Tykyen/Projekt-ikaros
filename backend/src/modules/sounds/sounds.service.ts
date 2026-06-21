// backend/src/modules/sounds/sounds.service.ts
import {
  Injectable,
  Inject,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import type { ISoundsRepository } from './interfaces/sounds-repository.interface';
import type { IWorldMembershipRepository } from '../worlds/interfaces/world-membership-repository.interface';
import type { Sound } from './interfaces/sound.interface';
import { WorldRole } from '../worlds/interfaces/world-membership.interface';
import { UserRole } from '../users/interfaces/user.interface';
import type { RequestUser } from '../../common/interfaces/request-user.interface';
import { worldAdminBypass } from '../../common/utils/world-elevation';
import type { CreateSoundDto } from './dto/create-sound.dto';
import type { UpdateSoundDto } from './dto/update-sound.dto';

@Injectable()
export class SoundsService {
  constructor(
    @Inject('ISoundsRepository') private readonly repo: ISoundsRepository,
    @Inject('IWorldMembershipRepository')
    private readonly membershipRepo: IWorldMembershipRepository,
  ) {}

  async assertCanManageWorld(
    requester: RequestUser,
    worldId: string,
  ): Promise<void> {
    if (worldAdminBypass(requester, worldId)) return;
    const membership = await this.membershipRepo.findByUserAndWorld(
      requester.id,
      worldId,
    );
    if (!membership || membership.role < WorldRole.PomocnyPJ)
      throw new ForbiddenException({
        code: 'NOT_WORLD_HELPER_PJ',
        message: 'Nedostatečná oprávnění',
      });
  }

  // R-RUN-01 (plný audit 2026-06-20) — GET /worlds/:id/sounds dřív neměl
  // membership gate → nečlen privátního světa četl celou zvukovou DB. Vzor
  // shodný s emotes.assertIsMember (vyloučí nečleny i Zadatele, pustí Ctenar+).
  async assertIsMember(requester: RequestUser, worldId: string): Promise<void> {
    if (worldAdminBypass(requester, worldId)) return;
    const membership = await this.membershipRepo.findByUserAndWorld(
      requester.id,
      worldId,
    );
    if (!membership || membership.role === WorldRole.Zadatel)
      throw new ForbiddenException({
        code: 'NOT_WORLD_MEMBER',
        message: 'Nejsi člen tohoto světa',
      });
  }

  // elevation se netýká — není world-scoped (globální zvuková DB).
  // Sync logika, ale držíme Promise<void> kontrakt — testy spoléhají na .rejects.toThrow.
  // eslint-disable-next-line @typescript-eslint/require-await
  async assertIsAdmin(userRole: UserRole): Promise<void> {
    if (userRole <= UserRole.Admin) return;
    throw new ForbiddenException({
      code: 'NOT_PLATFORM_ADMIN',
      message: 'Pouze Admin nebo Superadmin',
    });
  }

  async findByWorld(worldId: string): Promise<Sound[]> {
    return this.repo.findByWorld(worldId);
  }

  async findGlobal(): Promise<Sound[]> {
    return this.repo.findGlobal();
  }

  async findGlobalPending(): Promise<Sound[]> {
    return this.repo.findGlobalPending();
  }

  async findOne(id: string, worldId: string): Promise<Sound> {
    const sound = await this.repo.findById(id);
    if (!sound || sound.worldId !== worldId)
      throw new NotFoundException({
        code: 'SOUND_NOT_FOUND',
        message: 'Zvuk nenalezen',
      });
    return sound;
  }

  async findGlobalById(id: string): Promise<Sound> {
    const sound = await this.repo.findById(id);
    if (!sound || sound.worldId !== null)
      throw new NotFoundException({
        code: 'GLOBAL_SOUND_NOT_FOUND',
        message: 'Globální zvuk nenalezen',
      });
    return sound;
  }

  async createWorldSound(
    dto: CreateSoundDto,
    worldId: string,
    userId: string,
  ): Promise<Sound> {
    return this.repo.create({
      ...dto,
      worldId,
      status: 'active',
      createdBy: userId,
      proposedBy: null,
      proposedByWorldId: null,
      rejectReason: null,
    });
  }

  async createGlobalSound(dto: CreateSoundDto, userId: string): Promise<Sound> {
    const duplicate = await this.repo.findGlobalByUrlOrName(
      dto.youtubeUrl,
      dto.name,
    );
    if (duplicate)
      throw new ConflictException(
        `Duplicitní zvuk: ${duplicate.name} (${duplicate.id})`,
      );
    return this.repo.create({
      ...dto,
      worldId: null,
      status: 'active',
      createdBy: userId,
      proposedBy: null,
      proposedByWorldId: null,
      rejectReason: null,
    });
  }

  async nominateToGlobal(
    soundId: string,
    worldId: string,
    userId: string,
  ): Promise<Sound> {
    const sound = await this.repo.findById(soundId);
    if (!sound || sound.worldId !== worldId)
      throw new NotFoundException({
        code: 'SOUND_NOT_FOUND',
        message: 'Zvuk nenalezen',
      });
    const duplicate = await this.repo.findGlobalByUrlOrName(
      sound.youtubeUrl,
      sound.name,
    );
    if (duplicate)
      throw new ConflictException(
        `Duplicitní zvuk v globální DB: ${duplicate.name} (${duplicate.id})`,
      );
    return this.repo.create({
      worldId: null,
      name: sound.name,
      youtubeUrl: sound.youtubeUrl,
      mediaType: sound.mediaType,
      primaryFunction: sound.primaryFunction,
      environment: sound.environment,
      emotionalTone: sound.emotionalTone,
      intensity: sound.intensity,
      duration: sound.duration,
      loop: sound.loop,
      onsetProfile: sound.onsetProfile,
      outroProfile: sound.outroProfile,
      factionStyle: sound.factionStyle,
      techLevel: sound.techLevel,
      magicLevel: sound.magicLevel,
      combatEnergy: sound.combatEnergy,
      tags: sound.tags,
      notes: sound.notes,
      status: 'pending',
      proposedBy: userId,
      proposedByWorldId: worldId,
      createdBy: userId,
      rejectReason: null,
    });
  }

  async approveNomination(id: string): Promise<Sound> {
    const sound = await this.repo.findById(id);
    if (!sound || sound.worldId !== null || sound.status !== 'pending')
      throw new NotFoundException({
        code: 'PENDING_SOUND_NOMINATION_NOT_FOUND',
        message: 'Pending nomination nenalezena',
      });
    const updated = await this.repo.updateById(id, {
      status: 'active',
      rejectReason: null,
    });
    if (!updated)
      throw new NotFoundException({
        code: 'SOUND_DELETED_MID_OPERATION',
        message: 'Zvuk byl odstraněn před dokončením operace',
      });
    return updated;
  }

  async rejectNomination(id: string, reason: string): Promise<Sound> {
    const sound = await this.repo.findById(id);
    if (!sound || sound.worldId !== null || sound.status !== 'pending')
      throw new NotFoundException({
        code: 'PENDING_SOUND_NOMINATION_NOT_FOUND',
        message: 'Pending nomination nenalezena',
      });
    const updated = await this.repo.updateById(id, {
      status: 'rejected',
      rejectReason: reason,
    });
    if (!updated)
      throw new NotFoundException({
        code: 'SOUND_DELETED_MID_OPERATION',
        message: 'Zvuk byl odstraněn před dokončením operace',
      });
    return updated;
  }

  async importToWorld(
    globalSoundId: string,
    worldId: string,
    userId: string,
  ): Promise<Sound> {
    const sound = await this.repo.findById(globalSoundId);
    if (!sound || sound.worldId !== null || sound.status !== 'active')
      throw new NotFoundException({
        code: 'GLOBAL_SOUND_NOT_FOUND_OR_INACTIVE',
        message: 'Globální zvuk nenalezen nebo není schválen',
      });
    return this.repo.create({
      worldId,
      name: sound.name,
      youtubeUrl: sound.youtubeUrl,
      mediaType: sound.mediaType,
      primaryFunction: sound.primaryFunction,
      environment: sound.environment,
      emotionalTone: sound.emotionalTone,
      intensity: sound.intensity,
      duration: sound.duration,
      loop: sound.loop,
      onsetProfile: sound.onsetProfile,
      outroProfile: sound.outroProfile,
      factionStyle: sound.factionStyle,
      techLevel: sound.techLevel,
      magicLevel: sound.magicLevel,
      combatEnergy: sound.combatEnergy,
      tags: sound.tags,
      notes: sound.notes,
      status: 'active',
      proposedBy: null,
      proposedByWorldId: null,
      rejectReason: null,
      createdBy: userId,
    });
  }

  async updateWorldSound(
    id: string,
    worldId: string,
    dto: UpdateSoundDto,
  ): Promise<Sound> {
    const updated = await this.repo.updateByIdAndWorld(id, worldId, dto);
    if (!updated)
      throw new NotFoundException({
        code: 'SOUND_NOT_FOUND',
        message: 'Zvuk nenalezen',
      });
    return updated;
  }

  async updateGlobalSound(id: string, dto: UpdateSoundDto): Promise<Sound> {
    const sound = await this.repo.findById(id);
    if (!sound || sound.worldId !== null)
      throw new NotFoundException({
        code: 'GLOBAL_SOUND_NOT_FOUND',
        message: 'Globální zvuk nenalezen',
      });
    const updated = await this.repo.updateById(id, dto);
    if (!updated)
      throw new NotFoundException({
        code: 'SOUND_DELETED_MID_OPERATION',
        message: 'Zvuk byl odstraněn před dokončením operace',
      });
    return updated;
  }

  async removeWorldSound(id: string, worldId: string): Promise<void> {
    const deleted = await this.repo.deleteByIdAndWorld(id, worldId);
    if (!deleted)
      throw new NotFoundException({
        code: 'SOUND_NOT_FOUND',
        message: 'Zvuk nenalezen',
      });
  }

  async removeGlobalSound(id: string): Promise<void> {
    const sound = await this.repo.findById(id);
    if (!sound || sound.worldId !== null)
      throw new NotFoundException({
        code: 'GLOBAL_SOUND_NOT_FOUND',
        message: 'Globální zvuk nenalezen',
      });
    await this.repo.deleteById(id);
  }
}
