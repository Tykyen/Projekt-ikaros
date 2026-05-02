import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CharacterNotesSchemaClass } from '../schemas/character-notes.schema';
import { CharacterNotes } from '../interfaces/character-notes.interface';

@Injectable()
export class CharacterNotesRepository {
  constructor(@InjectModel(CharacterNotesSchemaClass.name) private readonly model: Model<CharacterNotesSchemaClass>) {}

  async findByCharacterId(characterId: string): Promise<CharacterNotes | null> {
    const doc = await this.model.findOne({ characterId }).lean().exec();
    return doc ? this.toEntity(doc as unknown as Record<string, unknown>) : null;
  }

  async create(characterId: string): Promise<CharacterNotes> {
    const created = new this.model({ characterId, content: '' });
    const saved = await created.save();
    return this.toEntity(saved.toObject() as unknown as Record<string, unknown>);
  }

  async update(characterId: string, data: Partial<CharacterNotes>): Promise<CharacterNotes | null> {
    const doc = await this.model.findOneAndUpdate({ characterId }, { $set: data }, { new: true }).lean().exec();
    return doc ? this.toEntity(doc as unknown as Record<string, unknown>) : null;
  }

  private toEntity(doc: Record<string, unknown>): CharacterNotes {
    return {
      id: String(doc._id),
      characterId: doc.characterId as string,
      content: (doc.content as string) ?? '',
    };
  }
}
