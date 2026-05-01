import { Injectable, OnApplicationBootstrap, Logger, Inject } from '@nestjs/common';
import type { IWorldsRepository } from '../../modules/worlds/interfaces/worlds-repository.interface';
import type { IWorldMembershipRepository } from '../../modules/worlds/interfaces/world-membership-repository.interface';
import { WorldRole } from '../../modules/worlds/interfaces/world-membership.interface';

export const MATRIX_WORLD_ID = '6d6174726978000000000001';

@Injectable()
export class MatrixWorldSeed implements OnApplicationBootstrap {
  private readonly logger = new Logger(MatrixWorldSeed.name);

  constructor(
    @Inject('IWorldsRepository') private readonly worldsRepo: IWorldsRepository,
    @Inject('IWorldMembershipRepository') private readonly membershipRepo: IWorldMembershipRepository,
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
    } catch (err) {
      this.logger.error('Matrix World seed failed', err);
    }
  }
}
