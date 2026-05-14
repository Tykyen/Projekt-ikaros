import { Injectable, Inject } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
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
  ) {}

  @OnEvent('world.created')
  async handleWorldCreated(world: World): Promise<void> {
    for (const template of PAGE_TEMPLATES) {
      const exists = await this.pagesRepo.existsBySlugAndWorld(
        template.slug,
        world.id,
      );
      if (exists) continue;
      const newPage: Partial<Page> = {
        ...template,
        worldId: world.id,
        content: '',
        plainText: '',
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
