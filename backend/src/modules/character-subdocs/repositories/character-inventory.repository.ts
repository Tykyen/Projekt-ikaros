import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, type ClientSession } from 'mongoose';
import { randomUUID } from 'crypto';
import { CharacterInventorySchemaClass } from '../schemas/character-inventory.schema';
import { CharacterInventory } from '../interfaces/character-inventory.interface';

/** RC-E4 — bezpečně vytáhne `{id,title}` sekcí z lean dokumentu (mixed array). */
function readSections(doc: unknown): { id: string; title?: string }[] {
  const sections = (doc as { sections?: Record<string, unknown>[] }).sections;
  return (sections ?? []).map((s) => ({
    id: s.id as string,
    title: s.title as string | undefined,
  }));
}

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

  /**
   * RC-E4 fix — atomický append položky do inventáře BEZ full-array `$set`.
   * Předchozí cesta (`getInventory` → mutace JS pole → `update({ sections })`)
   * byla read-modify-write: dva souběžné nákupy přečetly stejné sekce, oba
   * přidaly položku a druhý `$set` přepsal první → položka prvního zmizela.
   *
   * Strategie (dvě fáze, obě atomické na single dokumentu):
   *   1. `$push` přímo do `items` cílové sekce přes `arrayFilters` — když cílová
   *      sekce existuje (dle `sectionId`, nebo dle `title === autoTitle`).
   *   2. Když fáze 1 nic neupdatovala (sekce neexistuje), `$push` celé NOVÉ
   *      sekce s tou položkou — s podmínkou ve filtru, že auto-sekce ještě
   *      neexistuje (zabrání duplicitě auto-sekce při souběhu dvou „prvních"
   *      nákupů; druhý pak fáze 1 retry trefí už vytvořenou sekci).
   *
   * Vrací `{ sectionId, itemId }` cílové/nově vzniklé sekce + nové položky.
   */
  async appendItemToSection(
    characterId: string,
    item: { id: string; text: string; quantity?: number; note?: string },
    opts: { sectionId?: string; autoTitle: string },
    // RC-E5 — volitelná session, aby šel append zařadit do `withTransaction`
    // scope nákupu (atomicita s odečtem z účtu + purchase logem).
    session?: ClientSession,
  ): Promise<{ sectionId: string; itemId: string } | null> {
    const { sectionId, autoTitle } = opts;
    // Native driver (this.model.collection) — `sections` je Mixed sub-schema,
    // takže Mongoose `castArrayFilters` neumí cast `sections.$[sec].title`
    // ("Could not find path in schema"). Native driver bypassne casting; filtr
    // je čistý $push, žádná shape validace. Typovaný `$push` driveru je striktní
    // (vyžaduje known fields) → ručně typujeme jako Mixed (Record<string,unknown>).
    const coll = this.model.collection as unknown as {
      findOneAndUpdate: (
        filter: Record<string, unknown>,
        update: Record<string, unknown>,
        options: Record<string, unknown>,
      ) => Promise<Record<string, unknown> | null>;
    };
    // RC-E5 — session se native driveru předává v options (když je k dispozici).
    const withSession = (
      options: Record<string, unknown>,
    ): Record<string, unknown> => (session ? { ...options, session } : options);

    // Fáze 1 — append do existující sekce (preferovaný `sectionId`, jinak auto).
    const matchSection = sectionId
      ? { 'sec.id': sectionId }
      : { 'sec.title': autoTitle };
    const phase1 = await coll.findOneAndUpdate(
      { characterId, 'sections.id': { $exists: true } },
      { $push: { 'sections.$[sec].items': item } },
      withSession({ arrayFilters: [matchSection], returnDocument: 'after' }),
    );
    if (phase1) {
      const matched = readSections(phase1).find((s) =>
        sectionId ? s.id === sectionId : s.title === autoTitle,
      );
      if (matched) return { sectionId: matched.id, itemId: item.id };
      // findOneAndUpdate uspěl, ale arrayFilters nic netrefil (sekce nebyla) →
      // spadni do fáze 2.
    }

    // Fáze 2 — žádná cílová sekce → vytvoř NOVOU auto-sekci s položkou.
    // Podmínka `$not $elemMatch title==autoTitle` brání duplicitě auto-sekce
    // při souběhu (druhý souběžný „první" nákup ji nevytvoří podruhé).
    const newSection = {
      id: randomUUID(),
      title: autoTitle,
      content: '',
      order: 0,
      isCollapsed: false,
      items: [item],
    };
    const phase2 = await coll.findOneAndUpdate(
      {
        characterId,
        sections: { $not: { $elemMatch: { title: autoTitle } } },
      },
      { $push: { sections: newSection } },
      withSession({ returnDocument: 'after' }),
    );
    if (phase2) return { sectionId: newSection.id, itemId: item.id };

    // Fáze 2 selhala → auto-sekci mezitím vytvořil souběžný nákup. Retry fáze 1
    // na auto-sekci (teď už existuje) — atomický $push, žádný lost update.
    const retry = await coll.findOneAndUpdate(
      { characterId },
      { $push: { 'sections.$[sec].items': item } },
      withSession({
        arrayFilters: [{ 'sec.title': autoTitle }],
        returnDocument: 'after',
      }),
    );
    if (retry) {
      const matched = readSections(retry).find((s) => s.title === autoTitle);
      if (matched) return { sectionId: matched.id, itemId: item.id };
    }
    return null;
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
