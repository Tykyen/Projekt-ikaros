import { Injectable, OnApplicationBootstrap, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { IkarosArticleSchemaClass } from './schemas/ikaros-article.schema';

/**
 * Spec 3.2a — jednorázová migrace existujících článků z legacy PascalCase
 * kategorie (`'Povidky'`) na slug (`'povidky'`). Idempotentní (žádné stávající
 * články s legacy hodnotou = no-op).
 *
 * Spouští se při startu aplikace (`OnApplicationBootstrap`).
 *
 * ⚠️ Tato class se v produkci dá smazat až po prvním successful runu na
 * všech prostředích. Pro MVP necháváme — idempotence znamená že další run
 * neudělá nic.
 */
@Injectable()
export class ArticleCategorySlugMigration implements OnApplicationBootstrap {
  private readonly logger = new Logger(ArticleCategorySlugMigration.name);

  private static readonly MAPPING: Record<string, string> = {
    Povidky: 'povidky',
    Poezie: 'poezie',
    Uvahy: 'uvahy',
    Recenze: 'recenze',
    Postavy: 'postavy',
    Ostatni: 'ostatni',
  };

  constructor(
    @InjectModel(IkarosArticleSchemaClass.name)
    private readonly model: Model<IkarosArticleSchemaClass>,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    try {
      let totalMigrated = 0;
      for (const [legacy, slug] of Object.entries(
        ArticleCategorySlugMigration.MAPPING,
      )) {
        const result = await this.model
          .updateMany({ category: legacy }, { $set: { category: slug } })
          .exec();
        if (result.modifiedCount > 0) {
          this.logger.log(
            `Migrated ${result.modifiedCount} articles: ${legacy} → ${slug}`,
          );
          totalMigrated += result.modifiedCount;
        }
      }
      if (totalMigrated === 0) {
        this.logger.debug('No legacy article categories to migrate.');
      }
    } catch (err) {
      this.logger.error(
        `Failed article category slug migration: ${(err as Error).message}`,
      );
    }
  }
}
