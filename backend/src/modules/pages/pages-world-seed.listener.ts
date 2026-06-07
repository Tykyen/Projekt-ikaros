import { Injectable, Inject } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { sanitizeRichText } from '../../common/utils/sanitize-rich-text';
import { TipTapExtractor } from './tiptap-extractor.service';
import { SYSTEM_RULES_TEMPLATES } from './system-rules-templates';
import { buildTechnologyPage } from './technology-template';
import { buildMagicPage } from './magic-template';
import type { IPagesRepository } from './interfaces/pages-repository.interface';
import type { World } from '../worlds/interfaces/world.interface';
import type { Page, PageType } from './interfaces/page.interface';

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
  { slug: 'faq', type: 'Ostatní', title: 'FAQ', order: 3 },
  { slug: 'videa', type: 'Obrazovka', title: 'Instruktážní videa', order: 4 },
];

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
    return '';
  }

  @OnEvent('world.created')
  async handleWorldCreated(world: World): Promise<void> {
    for (const template of PAGE_TEMPLATES) {
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
  }
}
