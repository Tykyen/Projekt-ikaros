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
    const docs = await this.model
      .find({ worldId, isNpc: false, userId: { $exists: true, $ne: null } })
      .lean()
      .exec();
    return docs.map((doc) =>
      this.toEntity(doc as unknown as Record<string, unknown>),
    );
  }

  async findDirectory(worldId: string): Promise<CharacterDirectoryEntry[]> {
    const docs = await this.model
      .find(
        { worldId },
        { _id: 1, slug: 1, name: 1, imageUrl: 1, isNpc: 1, isLocation: 1 },
      )
      .lean()
      .exec();
    return docs.map((doc) => ({
      id: String((doc as unknown as Record<string, unknown>)._id),
      slug: (doc as unknown as Record<string, unknown>).slug as string,
      name: (doc as unknown as Record<string, unknown>).name as string,
      imageUrl: (doc as unknown as Record<string, unknown>).imageUrl as
        | string
        | undefined,
      isNpc:
        ((doc as unknown as Record<string, unknown>).isNpc as boolean) ?? false,
      isLocation:
        ((doc as unknown as Record<string, unknown>).isLocation as boolean) ??
        false,
    }));
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
      isLocation: (doc.isLocation as boolean) ?? false,
      imageUrl: doc.imageUrl as string | undefined,
      publicBio: (doc.publicBio as string) ?? '',
      publicInfoBlocks: (
        (doc.publicInfoBlocks as Record<string, unknown>[]) ?? []
      ).map((b) => ({
        label: b.label as string,
        value: b.value as string,
      })),
      privateBio: (doc.privateBio as string) ?? '',
      privateInfoBlocks: (
        (doc.privateInfoBlocks as Record<string, unknown>[]) ?? []
      ).map((b) => ({
        label: b.label as string,
        value: b.value as string,
      })),
      diaryData: (doc.diaryData as Record<string, unknown>) ?? {},
      extraBlocks: (doc.extraBlocks as SchemaBlock[]) ?? [],
      campaignSubjectId: doc.campaignSubjectId as string | undefined,
      accessRequirements: (
        (doc.accessRequirements as Record<string, unknown>[]) ?? []
      ).map((r) => ({
        type: r.type as 'UserId' | 'AKJ' | 'Role' | 'AKJType',
        value: r.value as string,
      })),
      customData: (doc.customData as Record<string, unknown>) ?? {},
      createdAt: doc.createdAt as Date,
    };
  }
}
