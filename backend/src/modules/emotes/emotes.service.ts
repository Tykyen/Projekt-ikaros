// backend/src/modules/emotes/emotes.service.ts
import {
  Injectable,
  Inject,
  ForbiddenException,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { ICustomEmotesRepository } from './interfaces/custom-emotes-repository.interface';
import type { CustomEmote } from './interfaces/custom-emote.interface';
import type { CreateEmoteDto } from './dto/create-emote.dto';
import type { UpdateEmoteDto } from './dto/update-emote.dto';
import type { IWorldMembershipRepository } from '../worlds/interfaces/world-membership-repository.interface';
import { WorldRole } from '../worlds/interfaces/world-membership.interface';
import { UserRole } from '../users/interfaces/user.interface';
import type { RequestUser } from '../../common/interfaces/request-user.interface';
import { worldAdminBypass } from '../../common/utils/world-elevation';

/** Krok 6.4a — limity počtu emotů jako ochrana proti spamu / storage. */
export const EMOTE_LIMIT_PER_WORLD = 100;
export const EMOTE_LIMIT_GLOBAL = 200;

@Injectable()
export class EmotesService {
  constructor(
    @Inject('ICustomEmotesRepository')
    private readonly repo: ICustomEmotesRepository,
    @Inject('IWorldMembershipRepository')
    private readonly membershipRepo: IWorldMembershipRepository,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async assertIsMember(requester: RequestUser, worldId: string): Promise<void> {
    if (worldAdminBypass(requester, worldId)) return;
    const membership = await this.membershipRepo.findByUserAndWorld(
      requester.id,
      worldId,
    );
    if (!membership || membership.role === WorldRole.Zadatel)
      throw new ForbiddenException({
        code: 'NOT_WORLD_MEMBER',
        message: 'Nejste členem tohoto světa',
      });
  }

  async assertWorldCanManage(
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

  assertGlobalCanManage(userRole: UserRole): void {
    if (userRole > UserRole.Admin)
      throw new ForbiddenException({
        code: 'NOT_PLATFORM_ADMIN',
        message: 'Vyžaduje Admin nebo Superadmin',
      });
  }

  async findByWorld(worldId: string): Promise<CustomEmote[]> {
    return this.repo.findByWorldId(worldId);
  }

  async findGlobal(): Promise<CustomEmote[]> {
    return this.repo.findGlobal();
  }

  /**
   * UM-11 — FE nahraje obrázek (přes /upload) PŘED tímto create. Když create
   * skončí konfliktem (limit / obsazený shortcode), nahraný blob nikdo
   * nereferencuje → orphan. Uklidíme ho přes existující `media.orphaned` cestu
   * (upload.service ho best-effort smaže z Cloudinaru/disku).
   */
  private cleanupOrphanedImage(imageUrl: string | null | undefined): void {
    if (imageUrl) {
      this.eventEmitter.emit('media.orphaned', { urls: [imageUrl] });
    }
  }

  async create(
    worldId: string,
    dto: CreateEmoteDto,
    userId: string,
  ): Promise<CustomEmote> {
    const count = await this.repo.countByWorldId(worldId);
    if (count >= EMOTE_LIMIT_PER_WORLD) {
      this.cleanupOrphanedImage(dto.imageUrl); // UM-11
      throw new ConflictException({
        code: 'EMOTE_LIMIT_REACHED',
        message: `Svět dosáhl limitu ${EMOTE_LIMIT_PER_WORLD} emotů. Smaž nepoužívané.`,
      });
    }
    const existing = await this.repo.findByShortcode(dto.shortcode, worldId);
    if (existing) {
      this.cleanupOrphanedImage(dto.imageUrl); // UM-11
      throw new ConflictException({
        code: 'EMOTE_SHORTCODE_TAKEN',
        message: `Shortcode :${dto.shortcode}: je již použit`,
      });
    }
    const emote = await this.repo.create({
      worldId,
      name: dto.name,
      shortcode: dto.shortcode,
      imageId: dto.imageId,
      imageUrl: dto.imageUrl,
      imageBytes: dto.imageBytes, // D-19.2 — velikost blobu z uploadu
      createdBy: userId,
      tags: dto.tags ?? [],
    });
    this.eventEmitter.emit('emote.created', { worldId, emote });
    return emote;
  }

  async createGlobal(
    dto: CreateEmoteDto,
    userId: string,
  ): Promise<CustomEmote> {
    const count = await this.repo.countGlobal();
    if (count >= EMOTE_LIMIT_GLOBAL) {
      this.cleanupOrphanedImage(dto.imageUrl); // UM-11
      throw new ConflictException({
        code: 'EMOTE_LIMIT_REACHED',
        message: `Platforma dosáhla limitu ${EMOTE_LIMIT_GLOBAL} globálních emotů.`,
      });
    }
    const existing = await this.repo.findByShortcode(dto.shortcode, null);
    if (existing) {
      this.cleanupOrphanedImage(dto.imageUrl); // UM-11
      throw new ConflictException({
        code: 'EMOTE_SHORTCODE_TAKEN',
        message: `Shortcode :${dto.shortcode}: je již použit globálně`,
      });
    }
    const emote = await this.repo.create({
      worldId: null,
      name: dto.name,
      shortcode: dto.shortcode,
      imageId: dto.imageId,
      imageUrl: dto.imageUrl,
      imageBytes: dto.imageBytes, // D-19.2 — velikost blobu z uploadu
      createdBy: userId,
      tags: dto.tags ?? [],
    });
    this.eventEmitter.emit('emote.created', { worldId: null, emote });
    return emote;
  }

  async deleteFromWorld(id: string, worldId: string): Promise<void> {
    const emote = await this.repo.findById(id);
    if (!emote || emote.worldId !== worldId)
      throw new NotFoundException({
        code: 'EMOTE_NOT_FOUND',
        message: 'Emote nenalezen',
      });
    await this.repo.deleteById(id);
    this.eventEmitter.emit('emote.deleted', { worldId, emoteId: id });
    // UM-04 — úklid blobu obrázku smazaného emotu.
    if (emote.imageUrl) {
      this.eventEmitter.emit('media.orphaned', { urls: [emote.imageUrl] });
    }
  }

  async deleteGlobal(id: string): Promise<void> {
    const emote = await this.repo.findById(id);
    if (!emote || emote.worldId !== null)
      throw new NotFoundException({
        code: 'GLOBAL_EMOTE_NOT_FOUND',
        message: 'Globální emote nenalezen',
      });
    await this.repo.deleteById(id);
    this.eventEmitter.emit('emote.deleted', { worldId: null, emoteId: id });
    // UM-04 — úklid blobu obrázku smazaného globálního emotu.
    if (emote.imageUrl) {
      this.eventEmitter.emit('media.orphaned', { urls: [emote.imageUrl] });
    }
  }

  /** D-NEW-emote-update — common updater (sdílen pro world i global). */
  private async applyUpdate(
    id: string,
    expectedWorldId: string | null,
    dto: UpdateEmoteDto,
  ): Promise<CustomEmote> {
    const emote = await this.repo.findById(id);
    if (!emote || emote.worldId !== expectedWorldId)
      throw new NotFoundException({
        code: 'EMOTE_NOT_FOUND',
        message: 'Emote nenalezen',
      });

    const updates: Partial<
      Pick<
        CustomEmote,
        'name' | 'shortcode' | 'imageId' | 'imageUrl' | 'imageBytes'
      >
    > = {};
    if (dto.name !== undefined) updates.name = dto.name;
    if (dto.shortcode !== undefined) updates.shortcode = dto.shortcode;
    if (dto.imageId !== undefined) updates.imageId = dto.imageId;
    if (dto.imageUrl !== undefined) updates.imageUrl = dto.imageUrl;
    // D-19.2 — velikost blobu; FE ji posílá spolu s novým imageUrl.
    if (dto.imageBytes !== undefined) updates.imageBytes = dto.imageBytes;

    if (Object.keys(updates).length === 0)
      throw new BadRequestException({
        code: 'EMOTE_UPDATE_EMPTY',
        message: 'Žádná pole k aktualizaci.',
      });

    // imageId / imageUrl musí být dodané jako pár (oboje, nebo žádné).
    const idChanged = updates.imageId !== undefined;
    const urlChanged = updates.imageUrl !== undefined;
    if (idChanged !== urlChanged)
      throw new BadRequestException({
        code: 'EMOTE_IMAGE_PAIR_REQUIRED',
        message: 'imageId a imageUrl musí být aktualizovány společně.',
      });

    // Při změně shortcode zkontrolovat kolizi (v rámci stejného scope).
    if (
      updates.shortcode !== undefined &&
      updates.shortcode !== emote.shortcode
    ) {
      const collision = await this.repo.findByShortcode(
        updates.shortcode,
        expectedWorldId,
      );
      if (collision && collision.id !== id)
        throw new ConflictException({
          code: 'EMOTE_SHORTCODE_TAKEN',
          message: `Shortcode :${updates.shortcode}: je již použit`,
        });
    }

    const updated = await this.repo.updateById(id, updates);
    if (!updated)
      throw new NotFoundException({
        code: 'EMOTE_NOT_FOUND',
        message: 'Emote nenalezen',
      });

    // UM-04 — úklid starého blobu při výměně obrázku emotu.
    if (
      updates.imageUrl !== undefined &&
      emote.imageUrl &&
      emote.imageUrl !== updates.imageUrl
    ) {
      this.eventEmitter.emit('media.orphaned', { urls: [emote.imageUrl] });
    }

    this.eventEmitter.emit('emote.updated', {
      worldId: expectedWorldId,
      emote: updated,
    });
    return updated;
  }

  async updateInWorld(
    id: string,
    worldId: string,
    dto: UpdateEmoteDto,
  ): Promise<CustomEmote> {
    return this.applyUpdate(id, worldId, dto);
  }

  async updateGlobal(id: string, dto: UpdateEmoteDto): Promise<CustomEmote> {
    return this.applyUpdate(id, null, dto);
  }

  async copy(
    id: string,
    sourceWorldId: string,
    targetWorldId: string,
    userId: string,
  ): Promise<CustomEmote> {
    const emote = await this.repo.findById(id);
    if (!emote || emote.worldId !== sourceWorldId)
      throw new NotFoundException({
        code: 'EMOTE_NOT_FOUND',
        message: 'Emote nenalezen',
      });
    const targetCount = await this.repo.countByWorldId(targetWorldId);
    if (targetCount >= EMOTE_LIMIT_PER_WORLD)
      throw new ConflictException({
        code: 'EMOTE_LIMIT_REACHED',
        message: `Cílový svět dosáhl limitu ${EMOTE_LIMIT_PER_WORLD} emotů.`,
      });
    const collision = await this.repo.findByShortcode(
      emote.shortcode,
      targetWorldId,
    );
    if (collision)
      throw new ConflictException({
        code: 'EMOTE_SHORTCODE_TAKEN',
        message: `Shortcode :${emote.shortcode}: již existuje v cílovém světě`,
      });
    const copied = await this.repo.create({
      worldId: targetWorldId,
      name: emote.name,
      shortcode: emote.shortcode,
      imageId: emote.imageId,
      imageUrl: emote.imageUrl,
      createdBy: userId,
      tags: emote.tags ?? [],
    });
    this.eventEmitter.emit('emote.created', {
      worldId: targetWorldId,
      emote: copied,
    });
    return copied;
  }
}
