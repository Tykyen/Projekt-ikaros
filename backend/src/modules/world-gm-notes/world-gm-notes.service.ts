import { Inject, Injectable, ForbiddenException } from '@nestjs/common';
import { WorldRole } from '../worlds/interfaces/world-membership.interface';
import { UserRole } from '../users/interfaces/user.interface';
import type { IWorldMembershipRepository } from '../worlds/interfaces/world-membership-repository.interface';
import { WorldGmNotesRepository } from './repositories/world-gm-notes.repository';
import { WorldGmNotes } from './interfaces/world-gm-notes.interface';

/**
 * 10.2j — PJ poznámkový blok na svět. Role gate: jen PJ práva (>= PomocnyPJ),
 * hráč → 403. Hráč si píše do `CharacterNotes` své postavy (jiný endpoint).
 */
@Injectable()
export class WorldGmNotesService {
  constructor(
    private readonly repo: WorldGmNotesRepository,
    @Inject('IWorldMembershipRepository')
    private readonly membershipRepo: IWorldMembershipRepository,
  ) {}

  async getNotes(
    userId: string,
    userRole: UserRole,
    worldId: string,
  ): Promise<WorldGmNotes> {
    await this.assertPj(userId, userRole, worldId);
    return this.repo.findOrCreate(worldId, userId);
  }

  async updateNotes(
    userId: string,
    userRole: UserRole,
    worldId: string,
    content: string,
  ): Promise<WorldGmNotes> {
    await this.assertPj(userId, userRole, worldId);
    return this.repo.updateContent(worldId, userId, content);
  }

  // Mirror CampaignService.getWorldRole — globální Admin/Sa = PJ.
  private async assertPj(
    userId: string,
    userRole: UserRole,
    worldId: string,
  ): Promise<void> {
    if (userRole <= UserRole.Admin) return;
    const membership = await this.membershipRepo.findByUserAndWorld(
      userId,
      worldId,
    );
    const role = membership?.role ?? WorldRole.Hrac;
    if (role < WorldRole.PomocnyPJ)
      throw new ForbiddenException({
        code: 'INSUFFICIENT_WORLD_ROLE',
        message: 'Deník PJ spravují jen vedoucí světa.',
      });
  }
}
