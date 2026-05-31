import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { BaseMongoRepository } from '../../../database/mongo/base-mongo.repository';
import { WorldSchemaClass } from '../schemas/world.schema';
import { ActiveMapWeather, World } from '../interfaces/world.interface';
import type { IWorldsRepository } from '../interfaces/worlds-repository.interface';

@Injectable()
export class MongoWorldsRepository
  extends BaseMongoRepository<World>
  implements IWorldsRepository
{
  constructor(
    @InjectModel(WorldSchemaClass.name)
    model: Model<WorldSchemaClass>,
  ) {
    super(model as never);
  }

  async findByIds(ids: string[]): Promise<World[]> {
    const validIds = ids
      .filter((id) => Types.ObjectId.isValid(id))
      .map((id) => new Types.ObjectId(id));
    if (validIds.length === 0) return [];
    const docs = await this.model
      .find({ _id: { $in: validIds }, isActive: true })
      .lean()
      .exec();
    return docs.map((doc) =>
      this.toEntity(doc as unknown as Record<string, unknown>),
    );
  }

  async existsBySlug(slug: string): Promise<boolean> {
    const count = await this.model
      .countDocuments({ slug: slug.toLowerCase() })
      .exec();
    return count > 0;
  }

  async increment(id: string, field: string, by: number): Promise<void> {
    if (!Types.ObjectId.isValid(id)) return;
    await this.model.findByIdAndUpdate(id, { $inc: { [field]: by } }).exec();
  }

  async findBySlug(slug: string): Promise<World | null> {
    const doc = await this.model
      .findOne({ slug: slug.toLowerCase(), isActive: true })
      .lean()
      .exec();
    return doc
      ? this.toEntity(doc as unknown as Record<string, unknown>)
      : null;
  }

  /**
   * D-NEW-slug-rename — najde svět podle aktuálního nebo libovolného předchozího
   * slugu (po renamu). Volá `findBySlug` první; pokud nenajde, hledá v
   * `previousSlugs` aby URL `/svet/old-slug` zůstaly funkční.
   */
  async findByCurrentOrPreviousSlug(slug: string): Promise<World | null> {
    const lower = slug.toLowerCase();
    const direct = await this.findBySlug(lower);
    if (direct) return direct;
    const doc = await this.model
      .findOne({ previousSlugs: lower, isActive: true })
      .lean()
      .exec();
    return doc
      ? this.toEntity(doc as unknown as Record<string, unknown>)
      : null;
  }

  /**
   * D-NEW-slug-rename — atomický rename. Validuje unique, pushne starý slug do
   * `previousSlugs`, nastaví nový. Vrací null pokud nový slug už existuje.
   */
  async renameSlug(worldId: string, newSlug: string): Promise<World | null> {
    const newLower = newSlug.toLowerCase();
    const collision = await this.model
      .findOne({ slug: newLower, _id: { $ne: worldId } })
      .lean()
      .exec();
    if (collision) return null;
    const current = await this.model.findById(worldId).lean().exec();
    if (!current) return null;
    const oldSlug = (current as { slug?: string }).slug;
    if (oldSlug === newLower) {
      return this.toEntity(current as unknown as Record<string, unknown>);
    }
    const updated = await this.model
      .findByIdAndUpdate(
        worldId,
        {
          $set: { slug: newLower },
          $addToSet: oldSlug ? { previousSlugs: oldSlug } : {},
        },
        { new: true },
      )
      .lean()
      .exec();
    return updated
      ? this.toEntity(updated as unknown as Record<string, unknown>)
      : null;
  }

  async findAll(): Promise<World[]> {
    // Veřejný přehled — jen objevitelné světy (public/open), nejnovější první.
    // `private`/`closed` se sem nedostanou (private = privacy, closed = nelze
    // vstoupit → nemá smysl v objevování). Detail closed je dál přístupný linkem.
    const docs = await this.model
      .find({ isActive: true, accessMode: { $in: ['public', 'open'] } })
      .sort({ createdAt: -1 })
      .lean()
      .exec();
    return docs.map((doc) =>
      this.toEntity(doc as unknown as Record<string, unknown>),
    );
  }

  async findByOwnerId(ownerId: string): Promise<World[]> {
    const docs = await this.model
      .find({ ownerId, isActive: true })
      .lean()
      .exec();
    return docs.map((doc) =>
      this.toEntity(doc as unknown as Record<string, unknown>),
    );
  }

  async addFavoriteSlug(worldId: string, slug: string): Promise<void> {
    if (!Types.ObjectId.isValid(worldId)) return;
    await this.model
      .findByIdAndUpdate(worldId, { $addToSet: { favoritePageSlugs: slug } })
      .exec();
  }

  async removeFavoriteSlug(worldId: string, slug: string): Promise<void> {
    if (!Types.ObjectId.isValid(worldId)) return;
    await this.model
      .findByIdAndUpdate(worldId, { $pull: { favoritePageSlugs: slug } })
      .exec();
  }

  async setActiveMapWeather(
    worldId: string,
    weather: ActiveMapWeather,
  ): Promise<void> {
    if (!Types.ObjectId.isValid(worldId)) return;
    await this.model
      .findByIdAndUpdate(worldId, { $set: { activeMapWeather: weather } })
      .exec();
  }

  async clearActiveMapWeather(worldId: string): Promise<void> {
    if (!Types.ObjectId.isValid(worldId)) return;
    await this.model
      .findByIdAndUpdate(worldId, { $set: { activeMapWeather: null } })
      .exec();
  }

  /**
   * D-NEW-theme-bg-empty (2026-05-21) — explicit $unset pro themeBackgroundUrl.
   * Volá se ze service.update() když FE pošle `themeBackgroundUrl: null`.
   * Bez tohoto by se uložil `null` jako field value místo aby byl odstraněn.
   */
  async clearThemeBackgroundUrl(id: string): Promise<void> {
    if (!Types.ObjectId.isValid(id)) return;
    await this.model
      .findByIdAndUpdate(id, { $unset: { themeBackgroundUrl: '' } })
      .exec();
  }

  /**
   * D-NEW-theme-bg-empty migrace (2026-05-23) — vyčistí všechny pre-existing
   * dokumenty kde `themeBackgroundUrl === ''` (legacy stav před FE fixem).
   * Idempotentní — opakované volání nic neudělá. Vrací počet updatovaných.
   */
  async migrateEmptyThemeBackgroundUrls(): Promise<{ updated: number }> {
    const res = await this.model
      .updateMany(
        { themeBackgroundUrl: '' },
        { $unset: { themeBackgroundUrl: '' } },
      )
      .exec();
    return { updated: res.modifiedCount ?? 0 };
  }

  protected toEntity(doc: Record<string, unknown>): World {
    return {
      id: String(doc._id),
      name: doc.name as string,
      slug: doc.slug as string,
      previousSlugs: (doc.previousSlugs as string[]) ?? [],
      description: doc.description as string | undefined,
      imageUrl: doc.imageUrl as string | undefined,
      genre: doc.genre as string | undefined,
      tones: (doc.tones as string[]) ?? [],
      playersWanted: doc.playersWanted as string | undefined,
      playerCount: (doc.playerCount as number) ?? 0,
      maxPlayers: (doc.maxPlayers as number | null | undefined) ?? null,
      dice: (doc.dice as string[]) ?? [],
      system: (doc.system as string) ?? 'matrix',
      ownerId: doc.ownerId as string,
      isActive: (doc.isActive as boolean) ?? true,
      accessMode: (doc.accessMode as string) ?? 'private',
      offeredCharacters:
        (doc.offeredCharacters as { slug: string; name: string }[]) ?? [],
      favoritePageSlugs: (doc.favoritePageSlugs as string[]) ?? [],
      defaultCalendarConfigSlug:
        (doc.defaultCalendarConfigSlug as string) ?? 'gregorian',
      timelineEpoch: (doc.timelineEpoch as number) ?? 0,
      themeId: (doc.themeId as string) ?? 'modre-nebe',
      themeOverrides: (doc.themeOverrides as Record<string, string>) ?? {},
      themeBackgroundUrl: doc.themeBackgroundUrl as string | undefined,
      activeMapWeather:
        (doc.activeMapWeather as World['activeMapWeather']) ?? null,
      createdAt: doc.createdAt as Date,
      updatedAt: doc.updatedAt as Date,
    };
  }
}
