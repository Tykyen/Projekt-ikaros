import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BaseMongoRepository } from '../../../database/mongo/base-mongo.repository';
import { PageSchemaClass } from '../schemas/page.schema';
import { Page, PageType } from '../interfaces/page.interface';
import { normalizePageTable } from '../normalize-page-table';
import type { IPagesRepository } from '../interfaces/pages-repository.interface';

@Injectable()
export class MongoPagesRepository
  extends BaseMongoRepository<Page>
  implements IPagesRepository
{
  constructor(
    @InjectModel(PageSchemaClass.name) model: Model<PageSchemaClass>,
  ) {
    super(model as never);
  }

  async findAll(): Promise<Page[]> {
    const docs = await this.model
      .find({})
      .sort({ order: 1, createdAt: -1 })
      .lean()
      .exec();
    return docs.map((doc) =>
      this.toEntity(doc as unknown as Record<string, unknown>),
    );
  }

  async findBySlugAndWorld(
    slug: string,
    worldId: string,
  ): Promise<Page | null> {
    const doc = await this.model
      .findOne({ slug: slug.toLowerCase(), worldId })
      .lean()
      .exec();
    return doc
      ? this.toEntity(doc as unknown as Record<string, unknown>)
      : null;
  }

  async findByWorld(worldId: string, type?: string): Promise<Page[]> {
    const filter: Record<string, unknown> = { worldId };
    if (type) filter.type = type;
    const docs = await this.model
      .find(filter)
      .sort({ order: 1, createdAt: -1 })
      .lean()
      .exec();
    return docs.map((doc) =>
      this.toEntity(doc as unknown as Record<string, unknown>),
    );
  }

  async existsBySlugAndWorld(slug: string, worldId: string): Promise<boolean> {
    const count = await this.model
      .countDocuments({ slug: slug.toLowerCase(), worldId })
      .exec();
    return count > 0;
  }

  async findDirectory(
    worldId: string,
    types?: string[],
  ): Promise<
    Pick<
      Page,
      | 'id'
      | 'slug'
      | 'title'
      | 'type'
      | 'order'
      | 'updatedAt'
      | 'imageUrl'
      | 'ownerUserId'
      | 'accessRequirements'
      | 'isWoodWide'
    >[]
  > {
    const filter: Record<string, unknown> = { worldId };
    if (types && types.length > 0) filter.type = { $in: types };
    const docs = await this.model
      .find(filter, {
        _id: 1,
        slug: 1,
        title: 1,
        type: 1,
        order: 1,
        updatedAt: 1,
        // Krok 9.1 — pro CharactersPage potřebujeme avatar + owner do karty.
        imageUrl: 1,
        ownerUserId: 1,
        // D-062c — AKJ ochrana pro stub karty v listings (shieldedBy se počítá
        // per-user v service.findDirectory).
        accessRequirements: 1,
        isWoodWide: 1,
      })
      .sort({ order: 1 })
      .lean()
      .exec();
    return docs.map((doc) => ({
      id: String(doc._id),
      slug: doc.slug,
      title: doc.title,
      type: doc.type,
      order: doc.order ?? 0,
      updatedAt: (doc as { updatedAt?: Date }).updatedAt as Date,
      imageUrl: (doc as { imageUrl?: string }).imageUrl,
      ownerUserId: (doc as { ownerUserId?: string }).ownerUserId,
      accessRequirements:
        (doc as { accessRequirements?: Page['accessRequirements'] })
          .accessRequirements ?? [],
      isWoodWide: (doc as { isWoodWide?: boolean }).isWoodWide ?? false,
    }));
  }

  async findAllSlugs(worldId: string): Promise<string[]> {
    const docs = await this.model.find({ worldId }, { slug: 1 }).lean().exec();
    return docs.map((doc) => doc.slug);
  }

  async findRandom(worldId: string, count: number): Promise<Page[]> {
    const docs = await this.model.aggregate([
      { $match: { worldId } },
      { $sample: { size: count } },
    ]);
    return docs.map((doc) =>
      this.toEntity(doc as unknown as Record<string, unknown>),
    );
  }

  async findBySlugs(slugs: string[], worldId: string): Promise<Page[]> {
    if (slugs.length === 0) return [];
    const docs = await this.model
      .find({ worldId, slug: { $in: slugs } })
      .lean()
      .exec();
    return docs.map((doc) =>
      this.toEntity(doc as unknown as Record<string, unknown>),
    );
  }

  /**
   * 7.1l — Najde stránky odkazující na `targetSlug` v daném světě. Hledá v
   * `content` (TipTap HTML) přes `$regex`. Match patterns:
   *   /svet/<worldSlug>/<targetSlug>("|#|?|\s|<)   ← absolutní s prefixem
   *   href="/<targetSlug>"                         ← root-relative
   *   href="<targetSlug>"                          ← bare slug (TipTap link extension)
   *
   * Pro <500 stránek/svět $regex stačí. Pro větší rozsah → search-coordinator
   * integrace v pozdější fázi.
   */
  async findBacklinksToSlug(
    worldId: string,
    targetSlug: string,
  ): Promise<Pick<Page, 'slug' | 'title' | 'type'>[]> {
    // Escape slugu pro regex (slugy jsou typicky alfa-num-dash, ale jistota neuškodí)
    const escaped = targetSlug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Patterny: href="…/{slug}…" — končící uvozovkou, #, ? nebo /
    const pattern = `href=["'][^"']*?(?:/|^)${escaped}(?:["'#?/]|$)`;
    const docs = await this.model
      .find(
        {
          worldId,
          slug: { $ne: targetSlug.toLowerCase() }, // self-link nepočítáme
          content: { $regex: pattern, $options: 'i' },
        },
        { slug: 1, title: 1, type: 1 },
      )
      .sort({ updatedAt: -1 })
      .limit(50)
      .lean()
      .exec();
    return docs.map((doc) => ({
      slug: doc.slug,
      title: doc.title,
      type: doc.type,
    }));
  }

  async findRecent(limit: number, worldIds?: string[]): Promise<Page[]> {
    const query: Record<string, unknown> = {};
    if (worldIds && worldIds.length > 0) query.worldId = { $in: worldIds };
    const docs = await this.model
      .find(query)
      .sort({ updatedAt: -1 })
      .limit(limit)
      .lean()
      .exec();
    return docs.map((d) =>
      this.toEntity(d as unknown as Record<string, unknown>),
    );
  }

  protected toEntity(doc: Record<string, unknown>): Page {
    return {
      id: String(doc._id),
      slug: doc.slug as string,
      worldId: doc.worldId as string,
      type: doc.type as PageType,
      title: doc.title as string,
      content: (doc.content as string) ?? '',
      imageUrl: doc.imageUrl as string | undefined,
      bigImage: (doc.bigImage as boolean) ?? false,
      // Krok 8.4 — normalizace table.values na `PageTableCell[]` (stará data
      // mohou být `string[]` / HTML stringy).
      table: normalizePageTable(doc.table),
      sections: ((doc.sections as Record<string, unknown>[]) ?? []).map(
        (s) => ({
          id: s.id as string,
          title: (s.title as string) ?? '',
          content: (s.content as string) ?? '',
          order: (s.order as number) ?? 0,
          isCollapsed: (s.isCollapsed as boolean) ?? true,
          items: ((s.items as Record<string, unknown>[]) ?? []).map((i) => ({
            id: i.id as string,
            text: (i.text as string) ?? '',
            quantity: i.quantity as number | undefined,
            note: i.note as string | undefined,
          })),
        }),
      ),
      galleryImages: (
        (doc.galleryImages as Record<string, unknown>[]) ?? []
      ).map((g) => ({
        id: g.id as string,
        url: g.url as string,
        caption: g.caption as string | undefined,
        order: (g.order as number) ?? 0,
      })),
      videos: ((doc.videos as Record<string, unknown>[]) ?? []).map((v) => ({
        id: v.id as string,
        title: (v.title as string) ?? '',
        youtubeUrl: (v.youtubeUrl as string) ?? '',
        youtubeVideoId: (v.youtubeVideoId as string) ?? '',
      })),
      menu: ((doc.menu as Record<string, unknown>[]) ?? []).map((m) => ({
        label: m.label as string,
        href: m.href as string,
        order: (m.order as number) ?? 0,
      })),
      plainText: (doc.plainText as string) ?? '',
      isWoodWide: (doc.isWoodWide as boolean) ?? false,
      accessRequirements: (
        (doc.accessRequirements as Record<string, unknown>[]) ?? []
      ).map((r) => ({
        type: r.type as 'UserId' | 'AKJ' | 'Role' | 'AKJType',
        value: r.value as string,
      })),
      customData: (doc.customData as Record<string, string>) ?? {},
      order: (doc.order as number) ?? 0,
      // Krok 9.1 — pole pro PostavaHrace / NPC. Permission filter řeší service.
      privateContent: (doc.privateContent as string) || undefined,
      privateInfoBlocks: doc.privateInfoBlocks
        ? (doc.privateInfoBlocks as Record<string, unknown>[]).map((b) => ({
            label: (b.label as string) ?? '',
            value: (b.value as string) ?? '',
          })) || undefined
        : undefined,
      ownerUserId: (doc.ownerUserId as string) || undefined,
      characterRef: doc.characterRef
        ? {
            characterId: (doc.characterRef as { characterId: string })
              .characterId,
          }
        : undefined,
      createdAt: doc.createdAt as Date,
      updatedAt: doc.updatedAt as Date,
    };
  }
}
