import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import { ConfigService } from '@nestjs/config';

/**
 * PERF-BE (dřív D-AUDIT `autoIndex` nález) — index sync v produkci.
 *
 * Kontext: `autoIndex` je v prod **vypnutý** (`database.module.ts`), aby mongoose
 * nebuildoval všech ~155 indexů blokujícím způsobem při KAŽDÉM startu (pomalý
 * boot). Vypnutí samo o sobě je past: bez náhradního kroku by **nové indexy v
 * produkci nikdy nevznikly**. Tahle služba je ten krok.
 *
 * Chování: po bootstrapu v produkci spustí `connection.syncIndexes()` **na
 * pozadí** (neblokuje `app.listen`, takže start zůstává rychlý). `syncIndexes`
 * vytvoří chybějící indexy a shodí ty, co nejsou ve schématu — všech 88 indexů
 * je schema-level (`Schema.index(...)`), takže drop se dotkne jen skutečně
 * osiřelých; žádné ruční `createIndex` mimo schéma neexistuje. Na existujících
 * indexech je to levný no-op (idempotentní na každém bootu).
 *
 * Escape hatch: `DB_SYNC_INDEXES=0` sync přeskočí (nouzový rychlý boot / rollback).
 * Mimo produkci se nic nedělá — dev má `autoIndex: true`, mongoose indexy
 * postavil při inicializaci modelů.
 */
@Injectable()
export class DatabaseIndexSyncService implements OnApplicationBootstrap {
  private readonly logger = new Logger(DatabaseIndexSyncService.name);

  constructor(
    @InjectConnection() private readonly connection: Connection,
    private readonly config: ConfigService,
  ) {}

  onApplicationBootstrap(): void {
    const isProd = this.config.get<string>('NODE_ENV') === 'production';
    if (!isProd) return; // dev: autoIndex:true už indexy postavil
    if (this.config.get<string>('DB_SYNC_INDEXES') === '0') {
      this.logger.warn(
        '[index-sync] Přeskočeno (DB_SYNC_INDEXES=0). Nové indexy se NEnasadí.',
      );
      return;
    }
    // Fire-and-forget: neblokuje start. Index buildy běží na pozadí; existující
    // indexy = no-op. Chyby se logují, ale start nezhodí.
    this.logger.log('[index-sync] Spouštím syncIndexes na pozadí…');
    void this.connection
      .syncIndexes()
      .then((dropped) => {
        const droppedModels = Object.entries(dropped ?? {}).filter(
          ([, idx]) => Array.isArray(idx) && idx.length > 0,
        );
        this.logger.log(
          `[index-sync] Hotovo. Modelů: ${Object.keys(dropped ?? {}).length}` +
            (droppedModels.length
              ? `, shozené osiřelé indexy: ${droppedModels
                  .map(([m, idx]) => `${m}[${(idx as string[]).join(',')}]`)
                  .join('; ')}`
              : ', žádné osiřelé indexy'),
        );
      })
      .catch((err: unknown) => {
        this.logger.error(
          `[index-sync] syncIndexes selhal (start pokračuje): ${String(err)}`,
        );
      });
  }
}
