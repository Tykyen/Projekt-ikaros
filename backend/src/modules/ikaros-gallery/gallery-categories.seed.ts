import {
  Injectable,
  OnApplicationBootstrap,
  Logger,
  Inject,
} from '@nestjs/common';
import type { IGalleryCategoriesRepository } from './interfaces/gallery-categories-repository.interface';

/**
 * Spec 3.3a — seed 5 výchozích kategorií galerie (idempotent přes
 * `findByKey + create`). Spouští se při startu (`OnApplicationBootstrap`);
 * existující kategorie přeskočí (neoverwrituje admin změny).
 *
 * Vzor sleduje `ArticleCategoriesSeed`.
 */
@Injectable()
export class GalleryCategoriesSeed implements OnApplicationBootstrap {
  private readonly logger = new Logger(GalleryCategoriesSeed.name);

  private static readonly DEFAULTS = [
    { key: 'fanart', label: 'Fanart', color: '#f06292', order: 0 },
    { key: 'mapy', label: 'Mapy a plány', color: '#4db6ac', order: 1 },
    { key: 'postavy', label: 'Postavy', color: '#ff8a65', order: 2 },
    { key: 'svety', label: 'Světy a lokace', color: '#64b5f6', order: 3 },
    { key: 'ostatni', label: 'Ostatní', color: '#8b98a5', order: 4 },
  ];

  constructor(
    @Inject('IGalleryCategoriesRepository')
    private readonly repo: IGalleryCategoriesRepository,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    try {
      for (const cat of GalleryCategoriesSeed.DEFAULTS) {
        const existing = await this.repo.findByKey(cat.key);
        if (existing) continue;
        await this.repo.create(cat);
        this.logger.log(`Seeded gallery category: ${cat.key}`);
      }
    } catch (err) {
      this.logger.error(
        `Failed to seed gallery categories: ${(err as Error).message}`,
      );
    }
  }
}
