import { Injectable, Inject, NotFoundException, ConflictException, ForbiddenException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { ICharactersRepository } from './interfaces/characters-repository.interface';
import type { IWorldMembershipRepository } from '../worlds/interfaces/world-membership-repository.interface';
import type { Character, CharacterDirectoryEntry, CharacterPublicView, PlayerCharacter } from './interfaces/character.interface';
import type { CreateCharacterDto } from './dto/create-character.dto';
import type { UpdateCharacterDto } from './dto/update-character.dto';
import type { ConvertCharacterDto } from './dto/convert-character.dto';
import { WorldRole } from '../worlds/interfaces/world-membership.interface';
import { UserRole } from '../users/interfaces/user.interface';

@Injectable()
export class CharactersService {
  constructor(
    @Inject('ICharactersRepository') private readonly charRepo: ICharactersRepository,
    @Inject('IWorldMembershipRepository') private readonly membershipRepo: IWorldMembershipRepository,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async assertCanManage(userId: string, userRole: UserRole, worldId: string): Promise<void> {
    if (userRole <= UserRole.Admin) return;
    const membership = await this.membershipRepo.findByUserAndWorld(userId, worldId);
    if (!membership || membership.role < WorldRole.PJ) throw new ForbiddenException('Nedostatečná oprávnění');
  }

  async findByWorld(worldId: string): Promise<CharacterPublicView[]> {
    const characters = await this.charRepo.findByWorld(worldId);
    return characters.map((c) => this.toPublicView(c));
  }

  async findBySlug(slug: string, worldId: string, requesterId: string): Promise<Character | CharacterPublicView> {
    const character = await this.charRepo.findBySlugAndWorld(slug, worldId);
    if (!character) throw new NotFoundException('Postava nenalezena');

    const membership = await this.membershipRepo.findByUserAndWorld(requesterId, worldId);
    const isPj = membership && membership.role >= WorldRole.PJ;
    const isOwner = !character.isNpc && character.userId === requesterId;

    if (isPj || isOwner) return character;
    return this.toPublicView(character);
  }

  async findBySlugRaw(slug: string, worldId: string): Promise<Character> {
    const character = await this.charRepo.findBySlugAndWorld(slug, worldId);
    if (!character) throw new NotFoundException('Postava nenalezena');
    return character;
  }

  async assertSubdocAccess(slug: string, worldId: string, requesterId: string): Promise<Character> {
    const character = await this.charRepo.findBySlugAndWorld(slug, worldId);
    if (!character) throw new NotFoundException('Postava nenalezena');
    const membership = await this.membershipRepo.findByUserAndWorld(requesterId, worldId);
    const isPj = membership && membership.role >= WorldRole.PJ;
    const isOwner = !character.isNpc && character.userId === requesterId;
    if (!isPj && !isOwner) throw new ForbiddenException('Přístup odepřen');
    return character;
  }

  async findByUser(userId: string, worldId: string): Promise<Character | null> {
    return this.charRepo.findByUserAndWorld(userId, worldId);
  }

  async getPlayerCharacters(worldId: string): Promise<PlayerCharacter[]> {
    const characters = await this.charRepo.findPlayerCharacters(worldId);
    return characters.map((c) => ({ name: c.name, slug: c.slug }));
  }

  async getDirectory(worldId: string): Promise<CharacterDirectoryEntry[]> {
    return this.charRepo.findDirectory(worldId);
  }

  async create(dto: CreateCharacterDto, worldId: string): Promise<Character> {
    const slug = dto.slug.toLowerCase();
    const exists = await this.charRepo.existsBySlugAndWorld(slug, worldId);
    if (exists) throw new ConflictException('Slug již existuje v tomto světě');

    const character = await this.charRepo.save({
      ...(dto as unknown as Partial<Character>),
      slug,
      worldId,
      publicBio: dto.publicBio ?? '',
      publicInfoBlocks: (dto.publicInfoBlocks as unknown as Character['publicInfoBlocks']) ?? [],
      privateBio: dto.privateBio ?? '',
      privateInfoBlocks: (dto.privateInfoBlocks as unknown as Character['privateInfoBlocks']) ?? [],
      diaryData: {},
      extraBlocks: [],
      accessRequirements: (dto.accessRequirements as unknown as Character['accessRequirements']) ?? [],
    });

    this.eventEmitter.emit('character.created', {
      characterId: character.id,
      worldId: character.worldId,
      userId: character.userId,
      isNpc: character.isNpc,
      name: character.name,
      imageUrl: character.imageUrl,
    });

    return character;
  }

  async update(slug: string, worldId: string, dto: UpdateCharacterDto, requester?: { id: string; role: UserRole }): Promise<Character> {
    const character = await this.charRepo.findBySlugAndWorld(slug, worldId);
    if (!character) throw new NotFoundException('Postava nenalezena');
    if (requester && requester.role > UserRole.Admin) {
      const membership = await this.membershipRepo.findByUserAndWorld(requester.id, worldId);
      const isPj = membership && membership.role >= WorldRole.PJ;
      const isOwner = !character.isNpc && character.userId === requester.id;
      if (!isPj && !isOwner) throw new ForbiddenException('Nedostatečná oprávnění');
    }

    const updateData: Partial<Character> = dto as unknown as Partial<Character>;
    if (dto.diaryData !== undefined) {
      updateData.diaryData = { ...(character.diaryData ?? {}), ...dto.diaryData };
    }

    const result = (await this.charRepo.update(character.id, updateData))!;
    this.eventEmitter.emit('character.updated', {
      characterId: result.id,
      worldId,
      userId: result.userId,
      isNpc: result.isNpc,
      name: result.name,
      imageUrl: result.imageUrl,
    });
    return result;
  }

  async convert(slug: string, worldId: string, dto: ConvertCharacterDto): Promise<Character> {
    const character = await this.charRepo.findBySlugAndWorld(slug, worldId);
    if (!character) throw new NotFoundException('Postava nenalezena');

    const toNpc = !dto.userId;
    const updated = await this.charRepo.update(character.id, {
      userId: toNpc ? undefined : dto.userId,
      isNpc: toNpc,
    });

    this.eventEmitter.emit('character.converted', {
      characterId: character.id,
      worldId,
      toNpc,
      userId: toNpc ? character.userId : dto.userId,
      name: character.name,
      imageUrl: character.imageUrl,
    });

    return updated!;
  }

  async delete(slug: string, worldId: string): Promise<void> {
    const character = await this.charRepo.findBySlugAndWorld(slug, worldId);
    if (!character) throw new NotFoundException('Postava nenalezena');
    await this.charRepo.delete(character.id);
  }

  private toPublicView(c: Character): CharacterPublicView {
    return {
      id: c.id,
      slug: c.slug,
      name: c.name,
      worldId: c.worldId,
      isNpc: c.isNpc,
      imageUrl: c.imageUrl,
      publicBio: c.publicBio,
      publicInfoBlocks: c.publicInfoBlocks,
    };
  }
}
