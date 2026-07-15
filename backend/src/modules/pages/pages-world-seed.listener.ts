import { Injectable, Inject } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { sanitizeRichText } from '../../common/utils/sanitize-rich-text';
import { TipTapExtractor } from './tiptap-extractor.service';
import { SYSTEM_RULES_TEMPLATES } from './system-rules-templates';
import { buildTechnologyPage } from './technology-template';
import { buildMagicPage } from './magic-template';
import { buildReligionPage } from './religion-template';
import type { IPagesRepository } from './interfaces/pages-repository.interface';
import type { World } from '../worlds/interfaces/world.interface';
import type { Page, PageType } from './interfaces/page.interface';
import { RULEBOOK_SEED_PAGES } from './rulebook/rulebook-seed-data';

const PAGE_TEMPLATES: Array<{
  slug: string;
  type: PageType;
  title: string;
  order: number;
}> = [
  { slug: 'pravidla', type: 'Ostatní', title: 'Pravidla', order: 0 },
  {
    slug: 'magicky-system',
    type: 'Ostatní',
    title: 'Magický systém',
    order: 1,
  },
  { slug: 'technologie', type: 'Ostatní', title: 'Technologie', order: 2 },
  // 2.3g — Náboženství vedle Magie/Technologie (worldbuilding osy). Seeduje se
  // i pro Matrix (Pravidlová kniha náboženství neřeší → NENÍ v REPLACES).
  { slug: 'nabozenstvi', type: 'Ostatní', title: 'Náboženství', order: 3 },
  { slug: 'faq', type: 'Ostatní', title: 'FAQ', order: 4 },
  { slug: 'videa', type: 'Obrazovka', title: 'Instruktážní videa', order: 5 },
];

/**
 * Svět se systémem „Ikaros pravidla" (matrix) má vlastní Pravidlovou knihu, která
 * nahrazuje tyto generické seedy (prázdná Pravidla + univerzální škály MÚ/TÚ).
 */
const MATRIX_RULEBOOK_REPLACES = new Set([
  'pravidla',
  'magicky-system',
  'technologie',
]);

@Injectable()
export class PagesWorldSeedListener {
  constructor(
    @Inject('IPagesRepository') private readonly pagesRepo: IPagesRepository,
    private readonly tipTapExtractor: TipTapExtractor,
  ) {}

  /**
   * Výchozí HTML obsah seedované stránky podle slugu.
   * - `pravidla` (2.3c) — per-system tahák dle `world.system`.
   * - `technologie` (2.3d) — univerzální škála TÚ + rozsah tohoto světa.
   * - `magicky-system` (2.3e) — univerzální škála MÚ + zvolené tradice.
   * - `nabozenstvi` (2.3g) — škála role náboženství + typy + osnova „co řešit".
   * Ostatní stránky zůstávají prázdné.
   */
  private seedContent(slug: string, world: World): string {
    if (slug === 'pravidla') {
      const raw = SYSTEM_RULES_TEMPLATES[world.system];
      return raw ? sanitizeRichText(raw) : '';
    }
    if (slug === 'technologie') {
      return sanitizeRichText(
        buildTechnologyPage(world.techLevelMin, world.techLevelMax),
      );
    }
    if (slug === 'magicky-system') {
      return sanitizeRichText(buildMagicPage(world.magicTraditions));
    }
    if (slug === 'nabozenstvi') {
      return sanitizeRichText(
        buildReligionPage(world.religionInfluence, world.religionTypes),
      );
    }
    return '';
  }

  @OnEvent('world.created')
  async handleWorldCreated(world: World): Promise<void> {
    const isMatrix = world.system === 'matrix';
    for (const template of PAGE_TEMPLATES) {
      // Matrix: generické pravidla/škály nahrazuje Pravidlová kniha (níž).
      if (isMatrix && MATRIX_RULEBOOK_REPLACES.has(template.slug)) continue;
      const exists = await this.pagesRepo.existsBySlugAndWorld(
        template.slug,
        world.id,
      );
      if (exists) continue;
      const content = this.seedContent(template.slug, world);
      const newPage: Partial<Page> = {
        ...template,
        worldId: world.id,
        content,
        plainText: content ? this.tipTapExtractor.extract(content) : '',
        menu: [],
        sections: [],
        galleryImages: [],
        videos: [],
        accessRequirements: [],
        isWoodWide: false,
      };
      await this.pagesRepo.save(newPage);
    }
    if (isMatrix) await this.seedRulebook(world.id);
  }

  /**
   * Pravidlová kniha (F1) — idempotentní seed hubu Pravidla + kapitol 1–9 ze
   * `RULEBOOK_SEED_PAGES` do daného (matrix) světa. Volá listener (nové světy)
   * i bootstrap (matrix singleton). Obsah/čísla 1:1 se zdrojem.
   */
  async seedRulebook(worldId: string): Promise<void> {
    for (const p of RULEBOOK_SEED_PAGES) {
      const exists = await this.pagesRepo.existsBySlugAndWorld(p.slug, worldId);
      if (exists) continue;
      const content = p.content ? sanitizeRichText(p.content) : '';
      const newPage: Partial<Page> = {
        slug: p.slug,
        title: p.title,
        type: p.type as PageType,
        order: p.order,
        worldId,
        imageUrl: p.imageUrl,
        bigImage: !!p.imageUrl,
        content,
        quickRef: p.quickRef,
        plainText: content ? this.tipTapExtractor.extract(content) : '',
        menu: p.menu ?? [],
        sections: [],
        galleryImages: [],
        videos: [],
        accessRequirements: [],
        isWoodWide: false,
      };
      await this.pagesRepo.save(newPage);
    }
  }
}
