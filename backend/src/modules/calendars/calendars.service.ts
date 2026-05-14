import {
  Injectable,
  Inject,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type { CharacterSubdocsService } from '../character-subdocs/character-subdocs.service';
import type { CharactersService } from '../characters/characters.service';
import type { ICharactersRepository } from '../characters/interfaces/characters-repository.interface';
import type { IWorldMembershipRepository } from '../worlds/interfaces/world-membership-repository.interface';
import type { IWorldsRepository } from '../worlds/interfaces/worlds-repository.interface';
import { WorldRole } from '../worlds/interfaces/world-membership.interface';
import { UserRole } from '../users/interfaces/user.interface';
import type { RequestUser } from '../../common/interfaces/request-user.interface';
import type {
  CharacterCalendar,
  CalendarEvent,
} from '../character-subdocs/interfaces/character-calendar.interface';
import type {
  CalendarAggregateResponse,
  UpdateCalendarSettingsDto,
} from './interfaces/calendars.interface';

@Injectable()
export class CalendarsService {
  constructor(
    @Inject('CharacterSubdocsService')
    private readonly subdocsService: CharacterSubdocsService,
    @Inject('CharactersService')
    private readonly charactersService: CharactersService,
    @Inject('ICharactersRepository')
    private readonly charRepo: ICharactersRepository,
    @Inject('IWorldMembershipRepository')
    private readonly membershipRepo: IWorldMembershipRepository,
    @Inject('IWorldsRepository')
    private readonly worldsRepo: IWorldsRepository,
  ) {}

  async aggregate(
    worldId: string,
    requester: RequestUser,
  ): Promise<CalendarAggregateResponse> {
    await this.assertCanModerate(worldId, requester);

    const [calendars, characters] = await Promise.all([
      this.subdocsService.getCalendarsByWorldId(worldId),
      this.charRepo.findByWorld(worldId),
    ]);

    const charMap = new Map(characters.map((c) => [c.id, c]));
    const visible = calendars.filter(
      (cal) => !cal.displaySettings?.isHiddenInAggregate,
    );

    const characterInfos = visible.map((cal) => {
      const char = charMap.get(cal.characterId);
      return {
        characterId: cal.characterId,
        slug: char?.slug ?? '',
        name: char?.name ?? '',
        color: cal.color,
        displaySettings: cal.displaySettings,
      };
    });

    const events = visible.flatMap((cal) => {
      const char = charMap.get(cal.characterId);
      return cal.events.map((event) => ({
        ...event,
        characterId: cal.characterId,
        slug: char?.slug ?? '',
        name: char?.name ?? '',
        color: cal.color,
      }));
    });

    return { characters: characterInfos, events };
  }

  async updateSettings(
    worldId: string,
    slug: string,
    dto: UpdateCalendarSettingsDto,
    requester: RequestUser,
  ): Promise<CharacterCalendar> {
    await this.assertCanModerate(worldId, requester);

    const character = await this.charactersService.findBySlugRaw(slug, worldId);
    const current = await this.subdocsService.getCalendar(character.id);

    const update: Partial<CharacterCalendar> = {};
    if (dto.color !== undefined) update.color = dto.color;
    if (dto.displaySettings !== undefined) {
      update.displaySettings = {
        ...current.displaySettings,
        ...dto.displaySettings,
      };
    }

    return this.subdocsService.updateCalendar(character.id, update);
  }

  async getBySlug(
    slug: string,
    worldId: string,
    requesterId: string,
  ): Promise<CharacterCalendar> {
    const character = await this.charactersService.assertSubdocAccess(
      slug,
      worldId,
      requesterId,
    );
    return this.subdocsService.getCalendar(character.id);
  }

  async updateBySlug(
    slug: string,
    worldId: string,
    events: CalendarEvent[],
    requesterId: string,
  ): Promise<CharacterCalendar> {
    const character = await this.charactersService.assertSubdocAccess(
      slug,
      worldId,
      requesterId,
    );
    return this.subdocsService.updateCalendar(character.id, { events });
  }

  /**
   * Auth pattern per spec 5.2 (2026-05-06):
   * - Admin/Superadmin shortcut bez membershipu
   * - WorldRole ≥ PomocnyPJ pro ostatní
   * - 404 anti-leak pro neexistující svět (per spec auth-required GET)
   */
  private async assertCanModerate(
    worldId: string,
    requester: RequestUser,
  ): Promise<void> {
    if (requester.role <= UserRole.Admin) return;
    const world = await this.worldsRepo.findById(worldId);
    if (!world) throw new NotFoundException('Svět nenalezen');
    const membership = await this.membershipRepo.findByUserAndWorld(
      requester.id,
      worldId,
    );
    if (!membership || membership.role < WorldRole.PomocnyPJ) {
      throw new ForbiddenException('Přístup odepřen');
    }
  }
}
