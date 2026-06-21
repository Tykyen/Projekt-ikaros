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
    contentOutline:
      '<h2>Historie</h2><p><em>Původ státu a klíčové události, které ho utvářely.</em></p>' +
      '<h2>Geografie</h2><p><em>Poloha, krajina, hranice a sousedé.</em></p>' +
      '<h2>Politika &amp; moc</h2><p><em>Kdo vládne, jak a komu je odpovědný.</em></p>' +
      '<h2>Hospodářství</h2><p><em>Z čeho stát žije, hlavní zdroje a obchod.</em></p>' +
      '<h2>Kultura</h2><p><em>Náboženství, zvyky, jazyk a svátky.</em></p>',
    order: 0,
  },
  {
    key: 'mesto',
    label: 'Město',
    icon: 'MapPin',
    defaultTitle: 'Profil města',
    headers: ['Stát', 'Obyvatel', 'Vůdce', 'Specialita', 'Rozloha'],
    contentOutline:
      '<h2>Historie</h2><p><em>Jak město vzniklo a čím prošlo.</em></p>' +
      '<h2>Významná místa</h2><ul><li><em>Tržiště, chrám, hradby, hospoda…</em></li></ul>' +
      '<h2>Obyvatelé &amp; atmosféra</h2><p><em>Kdo tu žije a jak to ve městě vypadá.</em></p>' +
      '<h2>Mocenské poměry</h2><p><em>Kdo má slovo, cechy, frakce, spory.</em></p>',
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
    contentOutline:
      '<h2>Hlavní zpráva</h2><p><em>Titulek a úvodní odstavec čísla.</em></p>' +
      '<h2>Z domova</h2><p><em>Krátké zprávy ze světa hráčů.</em></p>' +
      '<h2>Drobnosti &amp; inzeráty</h2><p><em>Doplňkové rubriky, vtipy, oznámení.</em></p>',
    order: 2,
  },
  {
    key: 'projekt',
    label: 'Projekt',
    icon: 'FileText',
    defaultTitle: 'Profil projektu',
    headers: ['Patron', 'Status', 'Datum zahájení', 'Cíl', 'Rozpočet'],
    contentOutline:
      '<h2>Cíl &amp; smysl</h2><p><em>Čeho chce projekt dosáhnout a proč.</em></p>' +
      '<h2>Postup</h2><ul><li><em>Milníky a co je hotovo.</em></li></ul>' +
      '<h2>Lidé &amp; zdroje</h2><p><em>Kdo na něm dělá a co k tomu potřebuje.</em></p>' +
      '<h2>Rizika</h2><p><em>Co může projekt potopit.</em></p>',
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
    contentOutline:
      '<h2>Cíle &amp; ideologie</h2><p><em>Oč frakci jde a v co věří.</em></p>' +
      '<h2>Struktura</h2><p><em>Kdo velí, jak je organizovaná, kdo do ní patří.</em></p>' +
      '<h2>Vztahy</h2><p><em>Spojenci, rivalové, otevřené konflikty.</em></p>' +
      '<h2>Zdroje &amp; vliv</h2><p><em>Čím disponuje a kde má moc.</em></p>',
    order: 4,
  },
  {
    key: 'organizace',
    label: 'Organizace',
    icon: 'Building2',
    defaultTitle: 'Profil organizace',
    headers: ['Typ', 'Vůdce', 'Hlavní sídlo', 'Založeno', 'Členů', 'Status'],
    contentOutline:
      '<h2>Poslání</h2><p><em>Účel organizace a co poskytuje.</em></p>' +
      '<h2>Vnitřní uspořádání</h2><p><em>Hierarchie, pobočky, role.</em></p>' +
      '<h2>Činnost</h2><p><em>Čím se zabývá v každodenním provozu.</em></p>' +
      '<h2>Postavení ve světě</h2><p><em>Pověst, partneři, oponenti.</em></p>',
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
          contentOutline: template.contentOutline,
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
