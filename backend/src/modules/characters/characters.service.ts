import { Injectable, Inject, NotFoundException, ConflictException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { ICharactersRepository } from './interfaces/characters-repository.interface';
import type { IWorldMembershipRepository } from '../worlds/interfaces/world-membership-repository.interface';
import type { Character, CharacterPublicView } from './interfaces/character.interface';
import type { CreateCharacterDto } from './dto/create-character.dto';
import type { UpdateCharacterDto } from './dto/update-character.dto';
import type { ConvertCharacterDto } from './dto/convert-character.dto';
import { WorldRole } from '../worlds/interfaces/world-membership.interface';

@Injectable()
export class CharactersService {
  constructor(
    @Inject('ICharactersRepository') private readonly charRepo: ICharactersRepository,
    @Inject('IWorldMembershipRepository') private readonly membershipRepo: IWorldMembershipRepository,
    private readonly eventEmitter: EventEmitter2,
  ) {}

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

  async findByUser(userId: string, worldId: string): Promise<Character | null> {
    return this.charRepo.findByUserAndWorld(userId, worldId);
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
      accessRequirements: (dto.accessRequirements as unknown as Character['accessRequirements']) ?? [],
    });

    this.eventEmitter.emit('character.created', {
      characterId: character.id,
      worldId: character.worldId,
      userId: character.userId,
      isNpc: character.isNpc,
    });

    return character;
  }

  async update(slug: string, worldId: string, dto: UpdateCharacterDto): Promise<Character> {
    const character = await this.charRepo.findBySlugAndWorld(slug, worldId);
    if (!character) throw new NotFoundException('Postava nenalezena');
    return (await this.charRepo.update(character.id, dto as unknown as Partial<Character>))!;
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
      userId: dto.userId,
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
      worldId: c.worldId,
      isNpc: c.isNpc,
      imageUrl: c.imageUrl,
      publicBio: c.publicBio,
      publicInfoBlocks: c.publicInfoBlocks,
    };
  }
}
