import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CharacterDiarySchemaClass } from '../schemas/character-diary.schema';
import {
  CharacterDiary,
  CustomDiaryBlock,
} from '../interfaces/character-diary.interface';

@Injectable()
export class CharacterDiaryRepository {
  constructor(
    @InjectModel(CharacterDiarySchemaClass.name)
    private readonly model: Model<CharacterDiarySchemaClass>,
  ) {}

  async findByCharacterId(characterId: string): Promise<CharacterDiary | null> {
    const doc = await this.model.findOne({ characterId }).lean().exec();
    return doc
      ? this.toEntity(doc as unknown as Record<string, unknown>)
      : null;
  }

  async create(characterId: string, worldId: string): Promise<CharacterDiary> {
    const created = new this.model({
      characterId,
      worldId,
      sections: [],
      customData: {},
    });
    const saved = await created.save();
    return this.toEntity(
      saved.toObject() as unknown as Record<string, unknown>,
    );
  }

  async update(
    characterId: string,
    data: Partial<CharacterDiary>,
  ): Promise<CharacterDiary | null> {
    const doc = await this.model
      .findOneAndUpdate({ characterId }, { $set: data }, { new: true })
      .lean()
      .exec();
    return doc
      ? this.toEntity(doc as unknown as Record<string, unknown>)
      : null;
  }

  /**
   * 2026-05-24 (D-040-followup) — delta merge variant pro `customData`. Místo
   * `$set: { customData: {...} }` (replace celého objektu, ničí staré klíče
   * z jiných system presetů) vygeneruje flat paths `$set: { 'customData.k1':
   * v1, 'customData.k2': v2 }`. Klíče v patchi s hodnotou `null` se
   * `$unset`uje (explicitní smazání).
   *
   * Použito v `character-subdocs.service.updateDiary` když `dto.customDataPatch`
   * je přítomný. Ostatní pole (personalDiarySchema, sections) se updatují
   * běžným `$set` paralelně.
   */
  async updateWithCustomDataPatch(
    characterId: string,
    extras: Partial<CharacterDiary>,
    customDataPatch: Record<string, unknown>,
  ): Promise<CharacterDiary | null> {
    const setOp: Record<string, unknown> = { ...extras };
    const unsetOp: Record<string, ''> = {};
    for (const [key, value] of Object.entries(customDataPatch)) {
      if (value === null) {
        unsetOp[`customData.${key}`] = '';
      } else {
        setOp[`customData.${key}`] = value;
      }
    }
    const update: Record<string, unknown> = {};
    if (Object.keys(setOp).length > 0) update.$set = setOp;
    if (Object.keys(unsetOp).length > 0) update.$unset = unsetOp;
    const doc = await this.model
      .findOneAndUpdate({ characterId }, update, { new: true })
      .lean()
      .exec();
    return doc
      ? this.toEntity(doc as unknown as Record<string, unknown>)
      : null;
  }

  async deleteByCharacterId(characterId: string): Promise<void> {
    await this.model.deleteMany({ characterId }).exec();
  }

  /**
   * 8.5 D-DIARY-2 — bulk reset overridů. Odstraní `personalDiarySchema` u všech
   * postav světa, které ho mají nastavený. Vrací počet upravených.
   */
  async clearOverridesByWorldId(worldId: string): Promise<number> {
    const res = await this.model
      .updateMany(
        { worldId, personalDiarySchema: { $ne: null } },
        { $unset: { personalDiarySchema: '' } },
      )
      .exec();
    return res.modifiedCount ?? 0;
  }

  /**
   * 8.5 D-DIARY-5 — bulk key remap přes všechny postavy světa.
   *
   * Pro každou postavu, která má v `customData` některý z `oldKey` v mapping,
   * přejmenuje keys 1:1 (`oldKey → newKey`). Hodnoty zachová. Aplikuje se
   * jen tam, kde má smysl (postava bez `personalDiarySchema` = používá svět-level
   * schéma; tam je rename relevantní). Postavy s vlastním override schématem
   * mají vlastní keys → rename světa je neovlivní.
   *
   * Implementace: load relevantní postavy → in-app remap → bulk write. Mongo
   * neumí dynamic field rename přes update operator, takže to musí být per-doc.
   * Pro 50–200 postav je to OK; pokud by mělo to být škálovatelnější, dluh.
   *
   * Vrací počet upravených postav.
   */
  async remapKeysByWorldId(
    worldId: string,
    mapping: Record<string, string>,
  ): Promise<number> {
    const oldKeys = Object.keys(mapping);
    if (oldKeys.length === 0) return 0;

    // Najdi jen postavy, jejichž customData obsahuje aspoň jeden z oldKeys
    // A NEMAJÍ vlastní personalDiarySchema (ten override = vlastní keyspace).
    const $or = oldKeys.map((k) => ({
      [`customData.${k}`]: { $exists: true },
    }));
    const docs = await this.model
      .find({
        worldId,
        $or,
        $and: [
          {
            $or: [
              { personalDiarySchema: { $exists: false } },
              { personalDiarySchema: null },
            ],
          },
        ],
      })
      .lean()
      .exec();

    if (docs.length === 0) return 0;

    const ops = docs.map((d) => {
      const cd = d.customData ?? {};
      const next: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(cd)) {
        next[mapping[k] ?? k] = v;
      }
      return {
        updateOne: {
          filter: { _id: d._id },
          update: { $set: { customData: next } },
        },
      };
    });

    const res = await this.model.bulkWrite(ops);
    return res.modifiedCount ?? 0;
  }

  private toEntity(doc: Record<string, unknown>): CharacterDiary {
    return {
      id: String(doc._id),
      characterId: doc.characterId as string,
      worldId: doc.worldId as string,
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
      personalDiarySchema:
        (doc.personalDiarySchema as CustomDiaryBlock[]) ?? undefined,
      customData: (doc.customData as Record<string, unknown>) ?? {},
      // D-066 — moderační skrytí (M2/M3); service gate podle něj vrací 404.
      moderationHidden: (doc.moderationHidden as boolean | undefined) ?? false,
      moderationHiddenReason: doc.moderationHiddenReason as string | undefined,
      // D-073 — optimistic concurrency token.
      updatedAt: doc.updatedAt as Date | undefined,
    };
  }
}
