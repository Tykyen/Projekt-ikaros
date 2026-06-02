import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BaseMongoRepository } from '../../../database/mongo/base-mongo.repository';
import { CharacterSchemaClass } from '../schemas/character.schema';
import {
  Character,
  CharacterDirectoryEntry,
  SchemaBlock,
} from '../interfaces/character.interface';
import type { ICharactersRepository } from '../interfaces/characters-repository.interface';

@Injectable()
export class MongoCharactersRepository
  extends BaseMongoRepository<Character>
  implements ICharactersRepository
{
  constructor(
    @InjectModel(CharacterSchemaClass.name) model: Model<CharacterSchemaClass>,
  ) {
    super(model as never);
  }

  async findAll(): Promise<Character[]> {
    const docs = await this.model.find().lean().exec();
    return docs.map((doc) =>
      this.toEntity(doc as unknown as Record<string, unknown>),
    );
  }

  async findBySlugAndWorld(
    slug: string,
    worldId: string,
  ): Promise<Character | null> {
    const doc = await this.model
      .findOne({ slug: slug.toLowerCase(), worldId })
      .lean()
      .exec();
    return doc
      ? this.toEntity(doc as unknown as Record<string, unknown>)
      : null;
  }

  async findByWorld(worldId: string): Promise<Character[]> {
    const docs = await this.model.find({ worldId }).lean().exec();
    return docs.map((doc) =>
      this.toEntity(doc as unknown as Record<string, unknown>),
    );
  }

  async findByUserAndWorld(
    userId: string,
    worldId: string,
  ): Promise<Character | null> {
    const doc = await this.model
      .findOne({ userId, worldId, isNpc: false })
      .lean()
      .exec();
    return doc
      ? this.toEntity(doc as unknown as Record<string, unknown>)
      : null;
  }

  async findPlayerCharacters(worldId: string): Promise<Character[]> {
    // 10.2c-edit-6: vrací VŠECHNY PC postavy (isNpc=false), včetně těch
    // bez ownera (userId null/missing) a pre-9.2 postav bez pole `kind`.
    // Vyloučeny jen Lokace (Character s kind='location' z Page typu Lokace,
    // spec 9.2 — ty mají isNpc=false ale do PC palety nepatří).
    //
    // Mongo dotaz vrací VŠECHNY isNpc=false, JS post-filter vyloučí lokace.
    // Jednodušší než `$ne`/`$not`/`$or` (které občas překvapí s indexy);
    // 100% deterministické. Cost: 50–100 dokumentů × jeden compare = sub-ms.
    const docs = await this.model.find({ worldId, isNpc: false }).lean().exec();
    return docs
      .filter((doc) => {
        const kind = (doc as unknown as Record<string, unknown>).kind;
        return kind !== 'location';
      })
      .map((doc) => this.toEntity(doc as unknown as Record<string, unknown>));
  }

  async findDirectory(worldId: string): Promise<CharacterDirectoryEntry[]> {
    // 9.1 — directory entry zúžený (imageUrl/isLocation odebrány). FE čte
    // Pages directory přes usePersonaDirectory; tento endpoint zůstává jen
    // pro backward kompat — odstraní se v navazujícím cleanup.
    const docs = await this.model
      .find({ worldId }, { _id: 1, slug: 1, name: 1, isNpc: 1, kind: 1 })
      .lean()
      .exec();
    return docs.map((doc) => {
      const d = doc as unknown as Record<string, unknown>;
      return {
        id: String(d._id),
        slug: d.slug as string,
        name: d.name as string,
        isNpc: (d.isNpc as boolean) ?? false,
        // Spec 9.2 — 'location' (Lokace) vs 'persona'. FE filtruje Lokace
        // z výběru postav pro hráče.
        kind: (d.kind as 'persona' | 'location') ?? 'persona',
      };
    });
  }

  async existsBySlugAndWorld(slug: string, worldId: string): Promise<boolean> {
    const count = await this.model
      .countDocuments({ slug: slug.toLowerCase(), worldId })
      .exec();
    return count > 0;
  }

  protected toEntity(doc: Record<string, unknown>): Character {
    return {
      id: String(doc._id),
      slug: doc.slug as string,
      name: (doc.name as string) ?? '',
      worldId: doc.worldId as string,
      userId: doc.userId as string | undefined,
      isNpc: (doc.isNpc as boolean) ?? false,
      // Spec 9.2 — `kind` default 'persona' pro pre-9.2 dokumenty (bez pole).
      kind: (doc.kind as 'persona' | 'location') ?? 'persona',
      diaryData: (doc.diaryData as Record<string, unknown>) ?? {},
      extraBlocks: (doc.extraBlocks as SchemaBlock[]) ?? [],
      campaignSubjectId: doc.campaignSubjectId as string | undefined,
      customData: (doc.customData as Record<string, unknown>) ?? {},
      preferredCalendarConfigId:
        (doc.preferredCalendarConfigId as string | null | undefined) ?? null,
      createdAt: doc.createdAt as Date,
      // D-073 — optimistic concurrency token (Mongoose timestamps).
      updatedAt: doc.updatedAt as Date | undefined,
    };
  }
}
