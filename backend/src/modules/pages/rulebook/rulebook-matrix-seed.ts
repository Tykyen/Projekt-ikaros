import {
  Injectable,
  OnApplicationBootstrap,
  Logger,
  Inject,
} from '@nestjs/common';
import { PagesWorldSeedListener } from '../pages-world-seed.listener';
import { MATRIX_WORLD_ID } from '../../../database/seed/matrix-world.seed';
import type { IWorldsRepository } from '../../worlds/interfaces/worlds-repository.interface';

/**
 * Pravidlová kniha (F1) — bootstrap seed do matrix singletonu (MATRIX_WORLD_ID).
 *
 * Matrix singleton svět vzniká přes `worldsRepo.save` (bez emitu `world.created`),
 * takže ho `PagesWorldSeedListener` nezachytí. Tento bootstrap proto rulebook
 * doseje při startu. Idempotentní (kontrola `existsBySlugAndWorld` v `seedRulebook`),
 * takže Superadminem upravené stránky nepřepíše.
 *
 * SS-01 (seed-scenario audit) — seed je **gated na existenci matrix světa**.
 * `MatrixWorldSeed` svět nevytvoří, když chybí Superadmin (`if (!superadmin) return`);
 * bez tohoto guardu by se rulebook stránky nasadily i tak → osiřelé stránky bez světa.
 * Pokud svět ještě není (např. tento bootstrap hook běžel dřív než world-seed, nebo
 * chybí Superadmin), přeskočíme — svět v DB přetrvá a další boot rulebook doseje
 * idempotentně. Garantuje: **nikdy stránky bez rodičovského světa**.
 */
@Injectable()
export class RulebookMatrixSeed implements OnApplicationBootstrap {
  private readonly logger = new Logger(RulebookMatrixSeed.name);

  constructor(
    private readonly seedListener: PagesWorldSeedListener,
    @Inject('IWorldsRepository') private readonly worldsRepo: IWorldsRepository,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    try {
      const world = await this.worldsRepo.findById(MATRIX_WORLD_ID);
      if (!world) {
        this.logger.warn(
          'Matrix svět neexistuje (chybí Superadmin nebo ještě nevznikl) — rulebook seed přeskočen (SS-01: zabraňuje osiřelým stránkám).',
        );
        return;
      }
      await this.seedListener.seedRulebook(MATRIX_WORLD_ID);
      this.logger.log('Pravidlová kniha — seed do matrix singletonu OK.');
    } catch (err) {
      this.logger.error('Rulebook matrix seed selhal', err);
    }
  }
}
