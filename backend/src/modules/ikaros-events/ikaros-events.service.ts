import {
  Injectable,
  Inject,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { IIkarosEventRepository } from './interfaces/ikaros-event-repository.interface';
import type {
  IkarosEventAttendee,
  IkarosEventItem,
  IkarosEventResponse,
} from './interfaces/ikaros-event.interface';
import type { CreateIkarosEventDto } from './dto/create-ikaros-event.dto';
import type { UpdateIkarosEventDto } from './dto/update-ikaros-event.dto';
import { UserRole } from '../users/interfaces/user.interface';
import type { IUsersRepository } from '../users/interfaces/users-repository.interface';

@Injectable()
export class IkarosEventsService {
  constructor(
    @Inject('IIkarosEventRepository')
    private readonly repo: IIkarosEventRepository,
    @Inject('IUsersRepository')
    private readonly usersRepo: IUsersRepository,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Akce jsou platformový obsah — spravovat smí jen globální role
   * Admin/Superadmin. PJ je world-scoped, sem nepatří (viz IkarosNews D-069).
   */
  private assertCanWrite(role: UserRole): void {
    if (role !== UserRole.Superadmin && role !== UserRole.Admin)
      throw new ForbiddenException({
        code: 'FORBIDDEN_PLATFORM_ROLE',
        message: 'Nedostatečná oprávnění',
      });
  }

  private parseDate(raw: string): Date {
    const d = new Date(raw);
    if (Number.isNaN(d.getTime()))
      throw new BadRequestException({
        code: 'IKAROS_EVENT_INVALID_DATE',
        message: 'Neplatné datum akce.',
      });
    return d;
  }

  async findAll(requestUserId: string): Promise<IkarosEventResponse[]> {
    const items = await this.repo.findActive();
    return this.toResponses(items, requestUserId);
  }

  async findUpcoming(
    requestUserId: string,
    limit: number,
  ): Promise<IkarosEventResponse[]> {
    const items = await this.repo.findUpcoming(limit);
    return this.toResponses(items, requestUserId);
  }

  async create(
    dto: CreateIkarosEventDto,
    authorId: string,
    role: UserRole,
  ): Promise<IkarosEventResponse> {
    this.assertCanWrite(role);
    const item = await this.repo.create({
      title: dto.title,
      date: this.parseDate(dto.date),
      description: dto.description,
      imageUrl: dto.imageUrl,
      imageFocalX: dto.imageFocalX,
      imageFocalY: dto.imageFocalY,
      imageZoom: dto.imageZoom,
      confirmable: dto.confirmable ?? true,
      attendeeUserIds: [],
      authorId,
      createdAtUtc: new Date(),
      isActive: true,
    });
    this.eventEmitter.emit('ikaros-events.changed', {});
    const [res] = await this.toResponses([item], authorId);
    return res;
  }

  /**
   * Spec 2.1b — partial update. Alespoň jedno pole povinné (jinak 400).
   * Neexistující id → 404. Authz: Admin/Superadmin.
   */
  async update(
    id: string,
    dto: UpdateIkarosEventDto,
    requestUserId: string,
    role: UserRole,
  ): Promise<IkarosEventResponse> {
    this.assertCanWrite(role);
    const fields = {
      ...(dto.title !== undefined && { title: dto.title }),
      ...(dto.date !== undefined && { date: this.parseDate(dto.date) }),
      ...(dto.description !== undefined && { description: dto.description }),
      ...(dto.imageUrl !== undefined && { imageUrl: dto.imageUrl }),
      ...(dto.imageFocalX !== undefined && { imageFocalX: dto.imageFocalX }),
      ...(dto.imageFocalY !== undefined && { imageFocalY: dto.imageFocalY }),
      ...(dto.imageZoom !== undefined && { imageZoom: dto.imageZoom }),
      ...(dto.imageFit !== undefined && { imageFit: dto.imageFit }),
      ...(dto.confirmable !== undefined && { confirmable: dto.confirmable }),
    };
    if (Object.keys(fields).length === 0)
      throw new BadRequestException({
        code: 'IKAROS_EVENT_EMPTY_UPDATE',
        message: 'Musíš upravit alespoň jedno pole.',
      });
    const updated = await this.repo.update(id, fields);
    if (!updated)
      throw new NotFoundException({
        code: 'IKAROS_EVENT_NOT_FOUND',
        message: 'Akce nenalezena',
      });
    this.eventEmitter.emit('ikaros-events.changed', {});
    const [res] = await this.toResponses([updated], requestUserId);
    return res;
  }

  async delete(id: string, role: UserRole): Promise<void> {
    this.assertCanWrite(role);
    const ok = await this.repo.softDelete(id);
    if (!ok)
      throw new NotFoundException({
        code: 'IKAROS_EVENT_NOT_FOUND',
        message: 'Akce nenalezena',
      });
    this.eventEmitter.emit('ikaros-events.changed', {});
  }

  /**
   * Spec 2.1b — toggle potvrzení účasti. Kdokoli přihlášený. Pokud akce nemá
   * `confirmable=true`, vrací 409 RSVP_DISABLED.
   */
  async confirm(
    id: string,
    requestUserId: string,
  ): Promise<IkarosEventResponse> {
    const event = await this.repo.findById(id);
    if (!event || !event.isActive)
      throw new NotFoundException({
        code: 'IKAROS_EVENT_NOT_FOUND',
        message: 'Akce nenalezena',
      });
    if (!event.confirmable)
      throw new ConflictException({
        code: 'RSVP_DISABLED',
        message: 'U této akce není potvrzování účasti povoleno.',
      });
    const alreadyAttending = event.attendeeUserIds.includes(requestUserId);
    const updated = await this.repo.setAttendee(
      id,
      requestUserId,
      !alreadyAttending,
    );
    if (!updated)
      throw new NotFoundException({
        code: 'IKAROS_EVENT_NOT_FOUND',
        message: 'Akce nenalezena',
      });
    this.eventEmitter.emit('ikaros-events.changed', {});
    const [res] = await this.toResponses([updated], requestUserId);
    return res;
  }

  /**
   * Mapuje DB entity → API response. Jeden batch lookup pro jména autorů
   * i účastníků (deduplikované userId). Smazaní uživatelé → prázdné jméno
   * (autor s legacy `authorName` snapshot fallback).
   */
  private async toResponses(
    items: IkarosEventItem[],
    requestUserId: string,
  ): Promise<IkarosEventResponse[]> {
    const ids = new Set<string>();
    for (const it of items) {
      ids.add(it.authorId);
      for (const uid of it.attendeeUserIds) ids.add(uid);
    }
    const names = new Map<string, string>();
    await Promise.all(
      [...ids].map(async (id) => {
        const user = await this.usersRepo.findById(id);
        if (user) names.set(id, user.username);
      }),
    );
    return items.map((it) => {
      const confirmedBy: IkarosEventAttendee[] = it.attendeeUserIds.map(
        (uid) => ({ userId: uid, userName: names.get(uid) ?? '' }),
      );
      return {
        id: it.id,
        title: it.title,
        date: it.date,
        description: it.description ?? '',
        imageUrl: it.imageUrl ?? null,
        imageFocalX: it.imageFocalX ?? null,
        imageFocalY: it.imageFocalY ?? null,
        imageZoom: it.imageZoom ?? null,
        imageFit: it.imageFit ?? null,
        confirmable: it.confirmable,
        confirmedCount: it.attendeeUserIds.length,
        confirmedBy,
        myRsvp: it.attendeeUserIds.includes(requestUserId)
          ? 'confirmed'
          : 'none',
        authorId: it.authorId,
        authorName: names.get(it.authorId) ?? it.authorName ?? '',
        createdAtUtc: it.createdAtUtc,
        isActive: it.isActive,
      };
    });
  }
}
