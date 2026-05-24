import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CharacterInventorySchemaClass } from '../schemas/character-inventory.schema';
import { CharacterInventory } from '../interfaces/character-inventory.interface';

@Injectable()
export class CharacterInventoryRepository {
  constructor(
    @InjectModel(CharacterInventorySchemaClass.name)
    private readonly model: Model<CharacterInventorySchemaClass>,
  ) {}

  async findByCharacterId(
    characterId: string,
  ): Promise<CharacterInventory | null> {
    const doc = await this.model.findOne({ characterId }).lean().exec();
    return doc
      ? this.toEntity(doc as unknown as Record<string, unknown>)
      : null;
  }

  async create(characterId: string): Promise<CharacterInventory> {
    const created = new this.model({
      characterId,
      isHidden: false,
      sections: [],
      notes: '',
    });
    const saved = await created.save();
    return this.toEntity(
      saved.toObject() as unknown as Record<string, unknown>,
    );
  }

  async update(
    characterId: string,
    data: Partial<CharacterInventory>,
  ): Promise<CharacterInventory | null> {
    const doc = await this.model
      .findOneAndUpdate({ characterId }, { $set: data }, { new: true })
      .lean()
      .exec();
    return doc
      ? this.toEntity(doc as unknown as Record<string, unknown>)
      : null;
  }

  async deleteByCharacterId(characterId: string): Promise<void> {
    await this.model.deleteMany({ characterId }).exec();
  }

  private toEntity(doc: Record<string, unknown>): CharacterInventory {
    return {
      id: String(doc._id),
      characterId: doc.characterId as string,
      isHidden: (doc.isHidden as boolean) ?? false,
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
      // 8.1-FIR — RichText „Rozepsané" Matrix-style.
      notes: (doc.notes as string) ?? '',
      // D-073 — optimistic concurrency token.
      updatedAt: doc.updatedAt as Date | undefined,
    };
  }
}
