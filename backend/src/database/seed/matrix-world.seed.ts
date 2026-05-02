import { Injectable, OnApplicationBootstrap, Logger, Inject } from '@nestjs/common';
import type { IWorldsRepository } from '../../modules/worlds/interfaces/worlds-repository.interface';
import type { IWorldMembershipRepository } from '../../modules/worlds/interfaces/world-membership-repository.interface';
import type { IWorldSettingsRepository } from '../../modules/worlds/interfaces/world-settings-repository.interface';
import { WorldRole } from '../../modules/worlds/interfaces/world-membership.interface';

export const MATRIX_WORLD_ID = '6d6174726978000000000001';

@Injectable()
export class MatrixWorldSeed implements OnApplicationBootstrap {
  private readonly logger = new Logger(MatrixWorldSeed.name);

  constructor(
    @Inject('IWorldsRepository') private readonly worldsRepo: IWorldsRepository,
    @Inject('IWorldMembershipRepository') private readonly membershipRepo: IWorldMembershipRepository,
    @Inject('IWorldSettingsRepository') private readonly settingsRepo: IWorldSettingsRepository,
  ) {}

  async onApplicationBootstrap() {
    try {
      const existing = await this.worldsRepo.findBySlug('matrix');
      if (existing) return;

      this.logger.log('Seeding Matrix World...');
      await this.worldsRepo.save({
        name: 'Matrix',
        slug: 'matrix',
        ownerId: process.env.SUPERADMIN_ID ?? 'system',
        isActive: true,
        accessMode: 'private',
        system: 'matrix',
        playerCount: 0,
      });
      this.logger.log('Matrix World seeded.');
      await this.settingsRepo.upsert(MATRIX_WORLD_ID, {
        akjTypes: [
          { key: 'akj',      name: 'AKJ',           level: 5 },
          { key: 'woodwide', name: 'Wood Wide Web',  level: 7 },
        ],
      });
      this.logger.log('Matrix World AKJ types seeded.');
    } catch (err) {
      this.logger.error('Matrix World seed failed', err);
    }
  }
}
