import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { Model } from 'mongoose';
import { v2 as cloudinary } from 'cloudinary';
import { logWarn } from '../../common/logging/log-error.util';
import { IkarosGallerySchemaClass } from '../ikaros-gallery/schemas/ikaros-gallery.schema';
import { WorldMapEntrySchemaClass } from '../world-maps/schemas/world-map-entry.schema';
import { MapSceneSchemaClass } from '../maps/schemas/map-scene.schema';
import { CustomEmoteDocument } from '../emotes/schemas/custom-emote.schema';
import { PageSchemaClass } from '../pages/schemas/page.schema';
import { BestieSchemaClass } from '../bestiae/schemas/bestie.schema';
import { WorldSchemaClass } from '../worlds/schemas/world.schema';
import { ChatMessageSchemaClass } from '../chat/schemas/chat-message.schema';
import { PlatformDocumentSchemaClass } from '../platform-chat/schemas/platform-document.schema';
import type {
  CostStats,
  CostBlobType,
  CostTopWorld,
} from './dto/cost-stats.dto';

const CACHE_TTL_MS = 60 * 60 * 1000; // počty + Cloudinary usage se mění pomalu → 1 h
const HAS_IMAGE = { $nin: [null, ''] };
const WORLD_SET = { $nin: [null, ''] };
const TOP_WORLDS = 10;

/**
 * 19.2 — počítadla nákladů (jen měřit, žádné vynucování). Tři vrstvy (spec 19.2):
 * A počty blobů (`countDocuments` — velikost v bytech DB u obrázků nedrží),
 * B přesné byty jen kde je DB má (chat přílohy + admin PDF),
 * C skutečný provoz Cloudinary (`api.usage()`; když chybí creds → available:false).
 *
 * Robustnost: dílčí bloky přes `safe*()` — jeden rozbitý dotaz nebo nedostupné
 * Cloudinary neshodí dashboard. Cache 1 h.
 */
@Injectable()
export class AdminCostsService {
  private readonly logger = new Logger(AdminCostsService.name);
  private cache: { data: CostStats; at: number } | null = null;
  private cloudinaryReady = false;

  constructor(
    @InjectModel(IkarosGallerySchemaClass.name)
    private readonly galleryModel: Model<IkarosGallerySchemaClass>,
    @InjectModel(WorldMapEntrySchemaClass.name)
    private readonly worldMapModel: Model<WorldMapEntrySchemaClass>,
    @InjectModel(MapSceneSchemaClass.name)
    private readonly sceneModel: Model<MapSceneSchemaClass>,
    @InjectModel(CustomEmoteDocument.name)
    private readonly emoteModel: Model<CustomEmoteDocument>,
    @InjectModel(PageSchemaClass.name)
    private readonly pageModel: Model<PageSchemaClass>,
    @InjectModel(BestieSchemaClass.name)
    private readonly bestieModel: Model<BestieSchemaClass>,
    @InjectModel(WorldSchemaClass.name)
    private readonly worldModel: Model<WorldSchemaClass>,
    @InjectModel(ChatMessageSchemaClass.name)
    private readonly chatModel: Model<ChatMessageSchemaClass>,
    @InjectModel(PlatformDocumentSchemaClass.name)
    private readonly documentModel: Model<PlatformDocumentSchemaClass>,
    private readonly config: ConfigService,
  ) {
    // Cloudinary config je globální singleton; parsujeme stejně jako UploadService
    // (idempotentní). Bez creds → vrstva C zůstane nedostupná (available:false).
    const url = this.config.get<string>('CLOUDINARY_URL');
    if (url) {
      try {
        const parsed = new URL(url);
        cloudinary.config({
          cloud_name: parsed.hostname,
          api_key: decodeURIComponent(parsed.username),
          api_secret: decodeURIComponent(parsed.password),
          secure: true,
        });
        this.cloudinaryReady = true;
      } catch (err) {
        logWarn(this.logger, 'CLOUDINARY_URL nejde parsovat', err);
      }
    }
  }

  async getCosts(): Promise<CostStats> {
    const now = Date.now();
    if (this.cache && now - this.cache.at < CACHE_TTL_MS)
      return this.cache.data;
    const data = await this.build(now);
    this.cache = { data, at: now };
    return data;
  }

  clearCache(): void {
    this.cache = null;
  }

  private async build(now: number): Promise<CostStats> {
    const [byType, topWorlds, chatBytes, docBytes, cloud] = await Promise.all([
      this.buildByType(),
      this.buildTopWorlds(),
      this.buildChatBytes(),
      this.buildDocBytes(),
      this.buildCloudinary(),
    ]);

    const total = byType.reduce((sum, b) => sum + b.count, 0);

    return {
      generatedAt: new Date(now).toISOString(),
      blobs: { total, byType, topWorlds },
      measuredBytes: { chatAttachments: chatBytes, adminDocuments: docBytes },
      cloudinary: cloud,
      ai: { available: false },
    };
  }

  /** Vrstva A — počet blobů per typ. */
  private async buildByType(): Promise<CostBlobType[]> {
    const defs: { type: string; run: () => Promise<number> }[] = [
      { type: 'gallery', run: () => this.count(this.galleryModel, {}) },
      { type: 'worldMaps', run: () => this.count(this.worldMapModel, {}) },
      {
        type: 'scenes',
        run: () => this.count(this.sceneModel, { imageUrl: HAS_IMAGE }),
      },
      { type: 'emotes', run: () => this.count(this.emoteModel, {}) },
      {
        type: 'pages',
        run: () => this.count(this.pageModel, { imageUrl: HAS_IMAGE }),
      },
      {
        type: 'bestiae',
        run: () =>
          this.count(this.bestieModel, {
            imageUrl: HAS_IMAGE,
            deletedAt: null,
          }),
      },
      {
        type: 'worldImages',
        run: () =>
          this.count(this.worldModel, { imageUrl: HAS_IMAGE, deletedAt: null }),
      },
    ];
    const counts = await Promise.all(
      defs.map(async (d) => ({ type: d.type, count: await d.run() })),
    );
    return counts.filter((c) => c.count > 0);
  }

  /** Vrstva A — top světy podle počtu world-scoped blobů (string worldId). */
  private async buildTopWorlds(): Promise<CostTopWorld[]> {
    const perWorld = new Map<string, number>();
    const sources: Model<unknown>[] = [
      this.worldMapModel as Model<unknown>,
      this.sceneModel as Model<unknown>,
      this.pageModel as Model<unknown>,
      this.bestieModel as Model<unknown>,
    ];
    for (const model of sources) {
      const rows = await this.safeArr('costs.topWorlds', () =>
        model
          .aggregate<{
            _id: string;
            count: number;
          }>([
            { $match: { worldId: WORLD_SET, imageUrl: HAS_IMAGE } },
            { $group: { _id: '$worldId', count: { $sum: 1 } } },
          ])
          .exec(),
      );
      for (const r of rows) {
        if (!r._id) continue;
        perWorld.set(r._id, (perWorld.get(r._id) ?? 0) + r.count);
      }
    }

    const top = [...perWorld.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, TOP_WORLDS);
    if (top.length === 0) return [];

    // Doplň názvy světů (worldId string → _id ObjectId, Mongoose zkonvertuje).
    const names = await this.safeArr('costs.topWorlds.names', () =>
      this.worldModel
        .find({ _id: { $in: top.map(([id]) => id) } }, { name: 1 })
        .lean()
        .exec(),
    );
    const nameById = new Map(
      names.map((w) => [
        String((w as { _id: unknown })._id),
        (w as { name?: string }).name ?? '—',
      ]),
    );

    return top.map(([worldId, count]) => ({
      worldId,
      worldName: nameById.get(worldId) ?? '—',
      count,
    }));
  }

  /** Vrstva B — suma bytů chat příloh (attachments[].size). */
  private async buildChatBytes(): Promise<number> {
    return this.safeNum('costs.chatBytes', async () => {
      const [row] = await this.chatModel
        .aggregate<{
          bytes: number;
        }>([
          { $match: { attachments: { $exists: true, $ne: [] } } },
          { $unwind: '$attachments' },
          { $group: { _id: null, bytes: { $sum: '$attachments.size' } } },
        ])
        .exec();
      return row?.bytes ?? 0;
    });
  }

  /** Vrstva B — suma bytů admin PDF (sizeBytes). */
  private async buildDocBytes(): Promise<number> {
    return this.safeNum('costs.docBytes', async () => {
      const [row] = await this.documentModel
        .aggregate<{
          bytes: number;
        }>([{ $group: { _id: null, bytes: { $sum: '$sizeBytes' } } }])
        .exec();
      return row?.bytes ?? 0;
    });
  }

  /** Vrstva C — skutečný provoz Cloudinary; nedostupné → available:false. */
  private async buildCloudinary(): Promise<CostStats['cloudinary']> {
    if (!this.cloudinaryReady) return { available: false };
    try {
      const u = (await cloudinary.api.usage()) as {
        plan?: string;
        storage?: { usage?: number };
        bandwidth?: { usage?: number };
        transformations?: { usage?: number };
        credits?: { usage?: number; limit?: number };
      };
      return {
        available: true,
        storageBytes: u.storage?.usage ?? 0,
        bandwidthBytes: u.bandwidth?.usage ?? 0,
        transformations: u.transformations?.usage ?? 0,
        credits:
          u.credits && typeof u.credits.limit === 'number'
            ? { used: u.credits.usage ?? 0, limit: u.credits.limit }
            : undefined,
        plan: u.plan,
      };
    } catch (err) {
      logWarn(this.logger, 'Cloudinary usage nedostupné', err);
      return { available: false };
    }
  }

  private async count(
    model: Model<unknown>,
    filter: Record<string, unknown>,
  ): Promise<number> {
    return this.safeNum('costs.count', () =>
      model.countDocuments(filter).exec(),
    );
  }

  private async safeNum(
    metric: string,
    fn: () => Promise<number>,
  ): Promise<number> {
    try {
      return await fn();
    } catch (err) {
      logWarn(this.logger, `Cost metric "${metric}" selhala, vracím 0`, err);
      return 0;
    }
  }

  private async safeArr<T>(
    metric: string,
    fn: () => Promise<T[]>,
  ): Promise<T[]> {
    try {
      return await fn();
    } catch (err) {
      logWarn(this.logger, `Cost metric "${metric}" selhala, vracím []`, err);
      return [];
    }
  }
}
