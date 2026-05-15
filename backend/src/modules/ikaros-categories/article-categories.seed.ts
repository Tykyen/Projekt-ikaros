import {
  Injectable,
  OnApplicationBootstrap,
  Logger,
  Inject,
} from '@nestjs/common';
import type { IArticleCategoriesRepository } from './interfaces/article-categories-repository.interface';

/**
 * Spec 3.2a — seed 6 výchozích kategorií (idempotent přes `findByKey + create`).
 *
 * Spouští se při startu aplikace (`OnApplicationBootstrap`). Pokud kategorie
 * už existuje, přeskočí ji (neoverwrituje admin změny barvy / labelu).
 *
 * Vzor sleduje `MatrixWorldSeed` (matrix-world.seed.ts).
 */
@Injectable()
export class ArticleCategoriesSeed implements OnApplicationBootstrap {
  private readonly logger = new Logger(ArticleCategoriesSeed.name);

  private static readonly DEFAULTS = [
    { key: 'povidky', label: 'Povídky', color: '#64b5f6', order: 0 },
    { key: 'poezie', label: 'Poezie', color: '#ce93d8', order: 1 },
    { key: 'uvahy', label: 'Úvahy', color: '#ffb74d', order: 2 },
    { key: 'recenze', label: 'Recenze', color: '#4caf50', order: 3 },
    { key: 'postavy', label: 'Postavy', color: '#ff8a65', order: 4 },
    { key: 'ostatni', label: 'Ostatní', color: '#8b98a5', order: 5 },
  ];

  constructor(
    @Inject('IArticleCategoriesRepository')
    private readonly repo: IArticleCategoriesRepository,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    try {
      for (const cat of ArticleCategoriesSeed.DEFAULTS) {
        const existing = await this.repo.findByKey(cat.key);
        if (existing) continue;
        await this.repo.create(cat);
        this.logger.log(`Seeded article category: ${cat.key}`);
      }
    } catch (err) {
      this.logger.error(
        `Failed to seed article categories: ${(err as Error).message}`,
      );
    }
  }
}
