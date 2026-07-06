import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { WorldGmNotesSchemaClass } from '../schemas/world-gm-notes.schema';
import { WorldGmNotes } from '../interfaces/world-gm-notes.interface';

@Injectable()
export class WorldGmNotesRepository {
  constructor(
    @InjectModel(WorldGmNotesSchemaClass.name)
    private readonly model: Model<WorldGmNotesSchemaClass>,
  ) {}

  /** Najde blok PJ; pokud neexistuje, lazy-vytvoří prázdný. */
  async findOrCreate(worldId: string, userId: string): Promise<WorldGmNotes> {
    const doc = await this.model
      .findOneAndUpdate(
        { worldId, userId },
        { $setOnInsert: { worldId, userId, content: '' } },
        { new: true, upsert: true },
      )
      .lean()
      .exec();
    return this.toEntity(doc as unknown as Record<string, unknown>);
  }

  async updateContent(
    worldId: string,
    userId: string,
    content: string,
  ): Promise<WorldGmNotes> {
    const doc = await this.model
      .findOneAndUpdate(
        { worldId, userId },
        { $set: { content } },
        { new: true, upsert: true },
      )
      .lean()
      .exec();
    return this.toEntity(doc as unknown as Record<string, unknown>);
  }

  /** 14.7c — všechny PJ poznámky světa (per-PJ bloky) pro world-export. */
  async findByWorldId(worldId: string): Promise<WorldGmNotes[]> {
    const docs = await this.model.find({ worldId }).lean().exec();
    return docs.map((d) =>
      this.toEntity(d as unknown as Record<string, unknown>),
    );
  }

  /**
   * FIX-57 — vlastní blok PJ (bez side-effectu na rozdíl od `findOrCreate`,
   * který by při exportu zbytečně založil prázdný blok). WorldGmNotes jsou
   * striktně per-PJ izolované — export smí vzít jen poznámky exportéra.
   */
  async findByWorldAndUser(
    worldId: string,
    userId: string,
  ): Promise<WorldGmNotes | null> {
    const doc = await this.model.findOne({ worldId, userId }).lean().exec();
    if (!doc) return null;
    return this.toEntity(doc as unknown as Record<string, unknown>);
  }

  private toEntity(doc: Record<string, unknown>): WorldGmNotes {
    return {
      id: String(doc._id),
      worldId: doc.worldId as string,
      userId: doc.userId as string,
      content: (doc.content as string) ?? '',
      updatedAt: doc.updatedAt as Date | undefined,
    };
  }
}
