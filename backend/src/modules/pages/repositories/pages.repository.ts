import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BaseMongoRepository } from '../../../database/mongo/base-mongo.repository';
import { PageSchemaClass } from '../schemas/page.schema';
import { Page, normalizePageType } from '../interfaces/page.interface';
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

  async findPendingByWorld(worldId: string): Promise<Page[]> {
    const docs = await this.model
      .find({ worldId, pageStatus: 'pending' })
      .sort({ createdAt: -1, _id: -1 })
      .lean()
      .exec();
    return docs.map((doc) =>
      this.toEntity(doc as unknown as Record<string, unknown>),
    );
  }

  /**
   * RC-P1 fix — atomický optimistic lock. `findOneAndUpdate` s podmínkou
   * `updatedAt: expectedUpdatedAt` ve filtru: ze dvou souběžných editů stejné
   * verze uspěje právě jeden (druhý už nesplní filtr → null = konflikt).
   */
  async updateIfUnchanged(
    id: string,
    data: Partial<Page>,
    expectedUpdatedAt: Date,
  ): Promise<Page | null> {
    const doc = await this.model
      .findOneAndUpdate(
        { _id: id, updatedAt: expectedUpdatedAt },
        { $set: data },
        { new: true },
      )
      .lean()
      .exec();
    return doc
      ? this.toEntity(doc as unknown as Record<string, unknown>)
      : null;
  }

  async existsBySlugAndWorld(slug: string, worldId: string): Promise<boolean> {
    const count = await this.model
      .countDocuments({ slug: slug.toLowerCase(), worldId })
      .exec();
    return count > 0;
  }

  async countByWorld(worldId: string): Promise<number> {
    // D-SEC-GAP-2026-07-11 — anti-abuse creation-flood: kumulativní strop
    // stránek světa. Index { worldId: 1 } existuje.
    return this.model.countDocuments({ worldId }).exec();
  }

  async findDirectory(
    worldId: string,
    types?: string[],
  ): Promise<
    (Pick<
      Page,
      | 'id'
      | 'slug'
      | 'title'
      | 'type'
      | 'order'
      | 'updatedAt'
      | 'imageUrl'
      | 'imageFocalX'
      | 'imageFocalY'
      | 'imageZoom'
      | 'imageFit'
      | 'ownerUserId'
      | 'pageStatus'
      | 'proposedBy'
      | 'accessRequirements'
      | 'isWoodWide'
      | 'moderationHidden'
    > & {
      /** D-DATA-SYNC-ZBYTKY a — link na Character entity (null = čistá stránka). */
      characterId: string | null;
    })[]
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
        // B4b — potřebné, aby service.findDirectory odfiltroval moderačně skryté.
        moderationHidden: 1,
        // Krok 9.1 — pro CharactersPage potřebujeme avatar + owner do karty.
        imageUrl: 1,
        // Parita s GameEvent — focal/zoom/fit pro výřez avataru v kartě.
        imageFocalX: 1,
        imageFocalY: 1,
        imageZoom: 1,
        imageFit: 1,
        ownerUserId: 1,
        // 15.11 — filtr pending návrhů v adresáři (jen autor + moderátor).
        pageStatus: 1,
        proposedBy: 1,
        // D-062c — AKJ ochrana pro stub karty v listings (shieldedBy se počítá
        // per-user v service.findDirectory).
        accessRequirements: 1,
        isWoodWide: 1,
        // 17.7 — existence familyTree rozlišuje nový Rodokmen od legacy (→ Zoom).
        familyTree: 1,
        // D-DATA-SYNC-ZBYTKY a — link na Character entity pro FE migraci
        // z legacy characters directory (adresář postav bez druhého fetche).
        characterRef: 1,
      })
      .sort({ order: 1 })
      .lean()
      .exec();
    return docs.map((doc) => ({
      id: String(doc._id),
      slug: doc.slug,
      title: doc.title,
      type: normalizePageType(
        doc.type,
        !!(doc as { familyTree?: unknown }).familyTree,
      ),
      order: doc.order ?? 0,
      updatedAt: (doc as { updatedAt?: Date }).updatedAt as Date,
      imageUrl: (doc as { imageUrl?: string }).imageUrl,
      imageFocalX: (doc as { imageFocalX?: number | null }).imageFocalX ?? null,
      imageFocalY: (doc as { imageFocalY?: number | null }).imageFocalY ?? null,
      imageZoom: (doc as { imageZoom?: number | null }).imageZoom ?? null,
      imageFit:
        (doc as { imageFit?: 'cover' | 'contain' | null }).imageFit ?? null,
      ownerUserId: (doc as { ownerUserId?: string }).ownerUserId,
      pageStatus:
        (doc as { pageStatus?: 'pending' | 'approved' }).pageStatus ??
        'approved',
      proposedBy: (doc as { proposedBy?: string }).proposedBy,
      accessRequirements:
        (doc as { accessRequirements?: Page['accessRequirements'] })
          .accessRequirements ?? [],
      isWoodWide: (doc as { isWoodWide?: boolean }).isWoodWide ?? false,
      moderationHidden:
        (doc as { moderationHidden?: boolean }).moderationHidden ?? false,
      // D-DATA-SYNC-ZBYTKY a — entry.id zůstává page ID (viz spec directory_id);
      // characterId je NOVÉ vedlejší pole. Čistá stránka (bez postavy) → null.
      characterId:
        (doc as { characterRef?: { characterId?: string } }).characterRef
          ?.characterId ?? null,
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
        { slug: 1, title: 1, type: 1, familyTree: 1 },
      )
      .sort({ updatedAt: -1 })
      .limit(50)
      .lean()
      .exec();
    return docs.map((doc) => ({
      slug: doc.slug,
      title: doc.title,
      type: normalizePageType(
        doc.type,
        !!(doc as { familyTree?: unknown }).familyTree,
      ),
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
      type: normalizePageType(doc.type, !!doc.familyTree),
      title: doc.title as string,
      content: (doc.content as string) ?? '',
      quickRef: (doc.quickRef as string) ?? '',
      imageUrl: doc.imageUrl as string | undefined,
      // D-19.2 — velikost blobu; staré dokumenty undefined.
      imageBytes: doc.imageBytes as number | undefined,
      bigImage: (doc.bigImage as boolean) ?? false,
      // Parita s GameEvent — výřez hlavního obrázku (focal/zoom/fit).
      imageFocalX: (doc.imageFocalX as number | null) ?? null,
      imageFocalY: (doc.imageFocalY as number | null) ?? null,
      imageZoom: (doc.imageZoom as number | null) ?? null,
      imageFit: (doc.imageFit as 'cover' | 'contain' | null) ?? null,
      // Krok 8.4 — normalizace table.values na `PageTableCell[]` (stará data
      // mohou být `string[]` / HTML stringy).
      table: normalizePageTable(doc.table),
      // 17.7 — rodokmen (whitelist people/unions). undefined = legacy (→ Zoom).
      familyTree: doc.familyTree
        ? {
            people: (
              (doc.familyTree as { people?: Record<string, unknown>[] })
                .people ?? []
            ).map((p) => ({
              id: p.id as string,
              name: (p.name as string) ?? '',
              sub: p.sub as string | undefined,
              born: p.born as string | undefined,
              died: p.died as string | undefined,
              imageUrl: p.imageUrl as string | undefined,
              color: p.color as string | undefined,
              pageSlug: p.pageSlug as string | undefined,
              x: (p.x as number) ?? 0,
              y: (p.y as number) ?? 0,
            })),
            unions: (
              (doc.familyTree as { unions?: Record<string, unknown>[] })
                .unions ?? []
            ).map((u) => ({
              id: u.id as string,
              aId: u.aId as string,
              bId: u.bId as string | undefined,
              childIds: (u.childIds as string[]) ?? [],
            })),
          }
        : undefined,
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
        // D-19.2 — velikost blobu položky galerie; staré položky undefined.
        bytes: g.bytes as number | undefined,
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
      moderationHidden: (doc.moderationHidden as boolean) ?? false,
      moderationHiddenReason: doc.moderationHiddenReason as string | undefined,
      accessRequirements: (
        (doc.accessRequirements as Record<string, unknown>[]) ?? []
      ).map((r) => ({
        type: r.type as 'UserId' | 'AKJ' | 'Role' | 'AKJType',
        value: r.value as string,
      })),
      customData: (doc.customData as Record<string, string>) ?? {},
      order: (doc.order as number) ?? 0,
      // Krok 9.1 — pole pro PostavaHrace / NPC.
      ownerUserId: (doc.ownerUserId as string) || undefined,
      // 15.11 — chybějící = 'approved' (legacy stránky se nesmí skrýt).
      pageStatus:
        (doc.pageStatus as 'pending' | 'approved' | undefined) ?? 'approved',
      proposedBy: (doc.proposedBy as string) || undefined,
      characterRef: doc.characterRef
        ? {
            characterId: (doc.characterRef as { characterId: string })
              .characterId,
          }
        : undefined,
      akjTabs: ((doc.akjTabs as Record<string, unknown>[]) ?? []).map((tab) => {
        const co = tab.contentOverride as Record<string, unknown> | undefined;
        return {
          id: tab.id as string,
          name: (tab.name as string) ?? '',
          order: (tab.order as number) ?? 0,
          access: ((tab.access as Record<string, unknown>[]) ?? []).map(
            (r) => ({
              type: r.type as 'UserId' | 'AKJ' | 'Role' | 'AKJType',
              value: r.value as string,
            }),
          ),
          ownerHidden: tab.ownerHidden as boolean | undefined,
          contentOverride: co
            ? {
                imageUrl: co.imageUrl as string | undefined,
                content: co.content as string | undefined,
                table: co.table ? normalizePageTable(co.table) : undefined,
              }
            : undefined,
        };
      }),
      createdAt: doc.createdAt as Date,
      updatedAt: doc.updatedAt as Date,
    };
  }
}
