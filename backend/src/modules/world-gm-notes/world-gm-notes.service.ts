import { Inject, Injectable, ForbiddenException } from '@nestjs/common';
import { WorldRole } from '../worlds/interfaces/world-membership.interface';
import type { RequestUser } from '../../common/interfaces/request-user.interface';
import { worldAdminBypass } from '../../common/utils/world-elevation';
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
    requester: RequestUser,
    worldId: string,
  ): Promise<WorldGmNotes> {
    await this.assertPj(requester, worldId);
    return this.repo.findOrCreate(worldId, requester.id);
  }

  async updateNotes(
    requester: RequestUser,
    worldId: string,
    content: string,
  ): Promise<WorldGmNotes> {
    await this.assertPj(requester, worldId);
    return this.repo.updateContent(worldId, requester.id, content);
  }

  // Mirror CampaignService.getWorldRole — elevovaný platform Admin/Sa = PJ
  // (world elevation; de-elevated admin spadne na membership roli).
  private async assertPj(
    requester: RequestUser,
    worldId: string,
  ): Promise<void> {
    if (worldAdminBypass(requester, worldId)) return;
    const membership = await this.membershipRepo.findByUserAndWorld(
      requester.id,
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
