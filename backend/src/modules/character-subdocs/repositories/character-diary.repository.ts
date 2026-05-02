import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CharacterDiarySchemaClass } from '../schemas/character-diary.schema';
import { CharacterDiary, CustomDiaryBlock } from '../interfaces/character-diary.interface';
import { PageSection, PageSectionItem } from '../../pages/interfaces/page.interface';

@Injectable()
export class CharacterDiaryRepository {
  constructor(@InjectModel(CharacterDiarySchemaClass.name) private readonly model: Model<CharacterDiarySchemaClass>) {}

  async findByCharacterId(characterId: string): Promise<CharacterDiary | null> {
    const doc = await this.model.findOne({ characterId }).lean().exec();
    return doc ? this.toEntity(doc as unknown as Record<string, unknown>) : null;
  }

  async create(characterId: string, worldId: string): Promise<CharacterDiary> {
    const created = new this.model({ characterId, worldId, sections: [], customData: {} });
    const saved = await created.save();
    return this.toEntity(saved.toObject() as unknown as Record<string, unknown>);
  }

  async update(characterId: string, data: Partial<CharacterDiary>): Promise<CharacterDiary | null> {
    const doc = await this.model.findOneAndUpdate({ characterId }, { $set: data }, { new: true }).lean().exec();
    return doc ? this.toEntity(doc as unknown as Record<string, unknown>) : null;
  }

  private toEntity(doc: Record<string, unknown>): CharacterDiary {
    return {
      id: String(doc._id),
      characterId: doc.characterId as string,
      worldId: doc.worldId as string,
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
      personalDiarySchema: (doc.personalDiarySchema as CustomDiaryBlock[]) ?? undefined,
      customData: (doc.customData as Record<string, unknown>) ?? {},
    };
  }
}
