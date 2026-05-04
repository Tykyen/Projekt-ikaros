// backend/src/modules/emotes/emotes.service.ts
import { Injectable, Inject, ForbiddenException, NotFoundException, ConflictException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ICustomEmotesRepository } from './interfaces/custom-emotes-repository.interface';
import { CustomEmote } from './interfaces/custom-emote.interface';
import { CreateEmoteDto } from './dto/create-emote.dto';
import type { IWorldMembershipRepository } from '../worlds/interfaces/world-membership-repository.interface';
import { WorldRole } from '../worlds/interfaces/world-membership.interface';
import { UserRole } from '../users/interfaces/user.interface';

@Injectable()
export class EmotesService {
  constructor(
    @Inject('ICustomEmotesRepository') private readonly repo: ICustomEmotesRepository,
    @Inject('IWorldMembershipRepository') private readonly membershipRepo: IWorldMembershipRepository,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async assertIsMember(userId: string, userRole: UserRole, worldId: string): Promise<void> {
    if (userRole <= UserRole.Admin) return;
    const membership = await this.membershipRepo.findByUserAndWorld(userId, worldId);
    if (!membership || membership.role === WorldRole.Pending)
      throw new ForbiddenException('Nejste členem tohoto světa');
  }

  async assertWorldCanManage(userId: string, userRole: UserRole, worldId: string): Promise<void> {
    if (userRole <= UserRole.Admin) return;
    const membership = await this.membershipRepo.findByUserAndWorld(userId, worldId);
    if (!membership || membership.role < WorldRole.PomocnyPJ)
      throw new ForbiddenException('Nedostatečná oprávnění');
  }

  assertGlobalCanManage(userRole: UserRole): void {
    if (userRole > UserRole.Admin)
      throw new ForbiddenException('Vyžaduje Admin nebo Superadmin');
  }

  async findByWorld(worldId: string): Promise<CustomEmote[]> {
    return this.repo.findByWorldId(worldId);
  }

  async findGlobal(): Promise<CustomEmote[]> {
    return this.repo.findGlobal();
  }

  async create(worldId: string, dto: CreateEmoteDto, userId: string): Promise<CustomEmote> {
    const existing = await this.repo.findByShortcode(dto.shortcode, worldId);
    if (existing) throw new ConflictException(`Shortcode :${dto.shortcode}: je již použit`);
    const emote = await this.repo.create({ worldId, name: dto.name, shortcode: dto.shortcode, imageId: dto.imageId, createdBy: userId });
    this.eventEmitter.emit('emote.created', { worldId, emote });
    return emote;
  }

  async createGlobal(dto: CreateEmoteDto, userId: string): Promise<CustomEmote> {
    const existing = await this.repo.findByShortcode(dto.shortcode, null);
    if (existing) throw new ConflictException(`Shortcode :${dto.shortcode}: je již použit globálně`);
    return this.repo.create({ worldId: null, name: dto.name, shortcode: dto.shortcode, imageId: dto.imageId, createdBy: userId });
  }

  async deleteFromWorld(id: string, worldId: string): Promise<void> {
    const emote = await this.repo.findById(id);
    if (!emote || emote.worldId !== worldId) throw new NotFoundException('Emote nenalezen');
    await this.repo.deleteById(id);
  }

  async deleteGlobal(id: string): Promise<void> {
    const emote = await this.repo.findById(id);
    if (!emote || emote.worldId !== null) throw new NotFoundException('Globální emote nenalezen');
    await this.repo.deleteById(id);
  }

  async copy(id: string, sourceWorldId: string, targetWorldId: string, userId: string): Promise<CustomEmote> {
    const emote = await this.repo.findById(id);
    if (!emote || emote.worldId !== sourceWorldId) throw new NotFoundException('Emote nenalezen');
    const collision = await this.repo.findByShortcode(emote.shortcode, targetWorldId);
    if (collision) throw new ConflictException(`Shortcode :${emote.shortcode}: již existuje v cílovém světě`);
    const copied = await this.repo.create({
      worldId: targetWorldId,
      name: emote.name,
      shortcode: emote.shortcode,
      imageId: emote.imageId,
      createdBy: userId,
    });
    this.eventEmitter.emit('emote.created', { worldId: targetWorldId, emote: copied });
    return copied;
  }
}
