import {
  Injectable,
  OnApplicationBootstrap,
  Logger,
  Inject,
} from '@nestjs/common';
import { logError } from '../../common/logging/log-error.util';
import { Types } from 'mongoose';
import type { IWorldsRepository } from '../../modules/worlds/interfaces/worlds-repository.interface';
import type { IUsersRepository } from '../../modules/users/interfaces/users-repository.interface';
import { UserRole } from '../../modules/users/interfaces/user.interface';
import type { IWorldSettingsRepository } from '../../modules/worlds/interfaces/world-settings-repository.interface';
import type { IWorldMembershipRepository } from '../../modules/worlds/interfaces/world-membership-repository.interface';
import { WorldRole } from '../../modules/worlds/interfaces/world-membership.interface';

export const MATRIX_WORLD_ID = '6d6174726978000000000001';

/** Krok 5.0 — Matrix svět má vlastní pozadí nezávislé na žánrovém motivu. */
const MATRIX_BACKGROUND_URL = '/themes/backgrounds/matrix.webp';
/** Krok 5.7 — Matrix svět běží na světovém vzhledu `ikaros` (synthwave + rain). */
const MATRIX_THEME_ID = 'ikaros';

@Injectable()
export class MatrixWorldSeed implements OnApplicationBootstrap {
  private readonly logger = new Logger(MatrixWorldSeed.name);

  constructor(
    @Inject('IWorldsRepository') private readonly worldsRepo: IWorldsRepository,
    @Inject('IUsersRepository') private readonly usersRepo: IUsersRepository,
    @Inject('IWorldSettingsRepository')
    private readonly settingsRepo: IWorldSettingsRepository,
    @Inject('IWorldMembershipRepository')
    private readonly membershipRepo: IWorldMembershipRepository,
  ) {}

  async onApplicationBootstrap() {
    try {
      const existing = await this.worldsRepo.findById(MATRIX_WORLD_ID);
      if (existing) {
        // Krok 5.0/5.7 — Matrix svět má vlastní pozadí + vzhled `ikaros`.
        // Idempotentní doplnění existujícímu světu.
        if (
          existing.themeBackgroundUrl !== MATRIX_BACKGROUND_URL ||
          existing.themeId !== MATRIX_THEME_ID
        ) {
          await this.worldsRepo.update(MATRIX_WORLD_ID, {
            themeBackgroundUrl: MATRIX_BACKGROUND_URL,
            themeId: MATRIX_THEME_ID,
          });
          this.logger.log('Matrix World — vzhled a pozadí nastaveny.');
        }
        // R-AUDIT — backfill owner membershipu i pro Matrix svět seedovaný před fixem.
        await this.ensureOwnerMembership(MATRIX_WORLD_ID, existing.ownerId);
        return;
      }

      const superadmin = await this.usersRepo.findFirstByRole(
        UserRole.Superadmin,
      );
      if (!superadmin) {
        this.logger.warn('No Superadmin found — Matrix World seed skipped.');
        return;
      }

      this.logger.log('Seeding Matrix World...');
      await this.worldsRepo.save({
        _id: new Types.ObjectId(MATRIX_WORLD_ID),
        name: 'Matrix',
        slug: 'matrix',
        ownerId: superadmin.id,
        isActive: true,
        accessMode: 'private',
        system: 'matrix',
        playerCount: 0,
        themeId: MATRIX_THEME_ID,
        themeBackgroundUrl: MATRIX_BACKGROUND_URL,
      } as never);
      this.logger.log('Matrix World seeded.');
      await this.settingsRepo.upsert(MATRIX_WORLD_ID, {
        akjTypes: [
          { key: 'akj', name: 'AKJ', level: 5 },
          { key: 'woodwide', name: 'Wood Wide Web', level: 7 },
        ],
      });
      this.logger.log('Matrix World AKJ types seeded.');
      await this.ensureOwnerMembership(MATRIX_WORLD_ID, superadmin.id);
    } catch (err) {
      logError(this.logger, 'Matrix World seed failed', err);
    }
  }

  /**
   * R-AUDIT — Matrix svět dřív vznikal BEZ owner membershipu → owner (superadmin)
   * měl na taktické mapě userRole=null a mizela mu orchestrace. Idempotentně
   * zajistí ownerovi PJ membership (i pro světy seedované před tímto fixem).
   */
  private async ensureOwnerMembership(
    worldId: string,
    ownerId: string,
  ): Promise<void> {
    const existing = await this.membershipRepo.findByUserAndWorld(
      ownerId,
      worldId,
    );
    if (existing) return;
    await this.membershipRepo.save({
      userId: ownerId,
      worldId,
      role: WorldRole.PJ,
      joinedAt: new Date(),
      akj: 0,
    });
    this.logger.log('Matrix World — owner PJ membership zajištěn.');
  }
}
