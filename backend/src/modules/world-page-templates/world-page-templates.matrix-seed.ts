import {
  Injectable,
  Inject,
  Logger,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { logError } from '../../common/logging/log-error.util';
import type { IWorldPageTemplatesRepository } from './interfaces/world-page-templates-repository.interface';
import type { IWorldsRepository } from '../worlds/interfaces/worlds-repository.interface';

/**
 * Krok 8.1a — Bootstrap seed šablon pro Matrix svět (slug='matrix').
 *
 * Šablony jsou **per-svět**: ostatní světy startují prázdné a PJ si vytvoří
 * vlastní. Matrix svět dostává v seedu 6 výchozích šablon (portováno z původní
 * FE konstanty `PAGE_TEMPLATES` v `lib/pageTemplates.ts`).
 *
 * Hook `OnApplicationBootstrap` se spouští **při každém startu**, ale seed je
 * idempotentní — kontroluje `existsByKey(worldId, key)` a vkládá jen chybějící.
 * Změna `label` / `headers` v této konstantě **neaktualizuje** existující záznam
 * v DB (PJ si je mohl mezitím upravit).
 */
const MATRIX_DEFAULT_TEMPLATES = [
  {
    key: 'stat',
    label: 'Stát',
    icon: 'Globe',
    defaultTitle: 'Profil státu',
    headers: ['Hlavní město', 'Měna', 'Rozloha', 'Vláda', 'Obyvatel', 'Jazyk'],
    order: 0,
  },
  {
    key: 'mesto',
    label: 'Město',
    icon: 'MapPin',
    defaultTitle: 'Profil města',
    headers: ['Stát', 'Obyvatel', 'Vůdce', 'Specialita', 'Rozloha'],
    order: 1,
  },
  {
    key: 'noviny-meta',
    label: 'Noviny — vydavatelské meta',
    icon: 'BookOpen',
    defaultTitle: 'Tiráž',
    headers: [
      'Stát',
      'Vydavatel',
      'Datum vydání',
      'Číslo vydání',
      'Šéfredaktor',
    ],
    order: 2,
  },
  {
    key: 'projekt',
    label: 'Projekt',
    icon: 'FileText',
    defaultTitle: 'Profil projektu',
    headers: ['Patron', 'Status', 'Datum zahájení', 'Cíl', 'Rozpočet'],
    order: 3,
  },
  {
    key: 'frakce',
    label: 'Frakce / Skupina',
    icon: 'Users',
    defaultTitle: 'Profil frakce',
    headers: [
      'Vůdce',
      'Sídlo',
      'Počet členů',
      'Filozofie',
      'Spojenci',
      'Nepřátelé',
    ],
    order: 4,
  },
  {
    key: 'organizace',
    label: 'Organizace',
    icon: 'Building2',
    defaultTitle: 'Profil organizace',
    headers: ['Typ', 'Vůdce', 'Hlavní sídlo', 'Založeno', 'Členů', 'Status'],
    order: 5,
  },
] as const;

@Injectable()
export class WorldPageTemplatesMatrixSeed implements OnApplicationBootstrap {
  private readonly logger = new Logger(WorldPageTemplatesMatrixSeed.name);

  constructor(
    @Inject('IWorldPageTemplatesRepository')
    private readonly repo: IWorldPageTemplatesRepository,
    @Inject('IWorldsRepository')
    private readonly worldsRepo: IWorldsRepository,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    try {
      const matrix = await this.worldsRepo.findBySlug('matrix');
      if (!matrix) {
        this.logger.debug(
          'Matrix svět (slug=matrix) nenalezen — seed šablon přeskočen',
        );
        return;
      }
      let inserted = 0;
      for (const template of MATRIX_DEFAULT_TEMPLATES) {
        const exists = await this.repo.existsByKey(matrix.id, template.key);
        if (exists) continue;
        await this.repo.save({
          worldId: matrix.id,
          key: template.key,
          label: template.label,
          headers: [...template.headers],
          defaultTitle: template.defaultTitle,
          icon: template.icon,
          order: template.order,
        });
        inserted += 1;
      }
      if (inserted > 0) {
        this.logger.log(
          `Matrix seed: vloženo ${inserted} výchozích šablon stránek`,
        );
      }
    } catch (err) {
      logError(this.logger, 'Matrix seed šablon selhal', err);
    }
  }
}
