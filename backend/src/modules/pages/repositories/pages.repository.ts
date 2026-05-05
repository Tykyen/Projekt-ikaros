import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BaseMongoRepository } from '../../../database/mongo/base-mongo.repository';
import { PageSchemaClass } from '../schemas/page.schema';
import { Page, PageSection, PageSectionItem, GalleryImage, InstructionalVideo, MenuItem, PageTable, AccessRequirement, PageType } from '../interfaces/page.interface';
import type { IPagesRepository } from '../interfaces/pages-repository.interface';

@Injectable()
export class MongoPagesRepository
  extends BaseMongoRepository<Page>
  implements IPagesRepository
{
  constructor(@InjectModel(PageSchemaClass.name) model: Model<PageSchemaClass>) {
    super(model as never);
  }

  async findAll(): Promise<Page[]> {
    const docs = await this.model.find({}).sort({ order: 1, createdAt: -1 }).lean().exec();
    return docs.map((doc) => this.toEntity(doc as unknown as Record<string, unknown>));
  }

  async findBySlugAndWorld(slug: string, worldId: string): Promise<Page | null> {
    const doc = await this.model.findOne({ slug: slug.toLowerCase(), worldId }).lean().exec();
    return doc ? this.toEntity(doc as unknown as Record<string, unknown>) : null;
  }

  async findByWorld(worldId: string, type?: string): Promise<Page[]> {
    const filter: Record<string, unknown> = { worldId };
    if (type) filter.type = type;
    const docs = await this.model.find(filter).sort({ order: 1, createdAt: -1 }).lean().exec();
    return docs.map((doc) => this.toEntity(doc as unknown as Record<string, unknown>));
  }

  async existsBySlugAndWorld(slug: string, worldId: string): Promise<boolean> {
    const count = await this.model.countDocuments({ slug: slug.toLowerCase(), worldId }).exec();
    return count > 0;
  }

  async findDirectory(worldId: string): Promise<Pick<Page, 'id' | 'slug' | 'title' | 'type' | 'order'>[]> {
    const docs = await this.model
      .find({ worldId }, { _id: 1, slug: 1, title: 1, type: 1, order: 1 })
      .sort({ order: 1 })
      .lean()
      .exec();
    return docs.map((doc) => ({
      id: String(doc._id),
      slug: doc.slug as string,
      title: doc.title as string,
      type: doc.type as PageType,
      order: (doc.order as number) ?? 0,
    }));
  }

  async findAllSlugs(worldId: string): Promise<string[]> {
    const docs = await this.model.find({ worldId }, { slug: 1 }).lean().exec();
    return docs.map((doc) => doc.slug as string);
  }

  async findRandom(worldId: string, count: number): Promise<Page[]> {
    const docs = await this.model.aggregate([
      { $match: { worldId } },
      { $sample: { size: count } },
    ]);
    return docs.map((doc) => this.toEntity(doc as unknown as Record<string, unknown>));
  }

  async findBySlugs(slugs: string[], worldId: string): Promise<Page[]> {
    if (slugs.length === 0) return [];
    const docs = await this.model.find({ worldId, slug: { $in: slugs } }).lean().exec();
    return docs.map((doc) => this.toEntity(doc as unknown as Record<string, unknown>));
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
      table: doc.table as PageTable | undefined,
      sections: ((doc.sections as Record<string, unknown>[]) ?? []).map((s) => ({
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
        } as PageSectionItem)),
      } as PageSection)),
      galleryImages: ((doc.galleryImages as Record<string, unknown>[]) ?? []).map((g) => ({
        id: g.id as string,
        url: g.url as string,
        caption: g.caption as string | undefined,
        order: (g.order as number) ?? 0,
      } as GalleryImage)),
      videos: ((doc.videos as Record<string, unknown>[]) ?? []).map((v) => ({
        id: v.id as string,
        title: (v.title as string) ?? '',
        youtubeUrl: (v.youtubeUrl as string) ?? '',
        youtubeVideoId: (v.youtubeVideoId as string) ?? '',
      } as InstructionalVideo)),
      menu: ((doc.menu as Record<string, unknown>[]) ?? []).map((m) => ({
        label: m.label as string,
        href: m.href as string,
        order: (m.order as number) ?? 0,
      } as MenuItem)),
      plainText: (doc.plainText as string) ?? '',
      isWoodWide: (doc.isWoodWide as boolean) ?? false,
      accessRequirements: ((doc.accessRequirements as Record<string, unknown>[]) ?? []).map((r) => ({
        type: r.type as 'UserId' | 'AKJ' | 'Role',
        value: r.value as string,
      } as AccessRequirement)),
      customData: (doc.customData as Record<string, string>) ?? {},
      order: (doc.order as number) ?? 0,
      createdAt: doc.createdAt as Date,
      updatedAt: doc.updatedAt as Date,
    };
  }
}
