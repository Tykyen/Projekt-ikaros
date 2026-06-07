import { Injectable, OnApplicationBootstrap, Logger } from '@nestjs/common';
import { PagesWorldSeedListener } from '../pages-world-seed.listener';
import { MATRIX_WORLD_ID } from '../../../database/seed/matrix-world.seed';

/**
 * Pravidlová kniha (F1) — bootstrap seed do matrix singletonu (MATRIX_WORLD_ID).
 *
 * Matrix singleton svět vzniká přes `worldsRepo.save` (bez emitu `world.created`),
 * takže ho `PagesWorldSeedListener` nezachytí. Tento bootstrap proto rulebook
 * doseje při startu. Idempotentní (kontrola `existsBySlugAndWorld` v `seedRulebook`),
 * takže Superadminem upravené stránky nepřepíše.
 */
@Injectable()
export class RulebookMatrixSeed implements OnApplicationBootstrap {
  private readonly logger = new Logger(RulebookMatrixSeed.name);

  constructor(private readonly seedListener: PagesWorldSeedListener) {}

  async onApplicationBootstrap(): Promise<void> {
    try {
      await this.seedListener.seedRulebook(MATRIX_WORLD_ID);
      this.logger.log('Pravidlová kniha — seed do matrix singletonu OK.');
    } catch (err) {
      this.logger.error('Rulebook matrix seed selhal', err);
    }
  }
}
