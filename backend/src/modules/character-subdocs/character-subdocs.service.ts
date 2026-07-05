import { Injectable, Inject, NotFoundException, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { randomUUID } from 'crypto';
import type { ClientSession } from 'mongoose';
import type { CharacterDiaryRepository } from './repositories/character-diary.repository';
import type { CharacterCalendarRepository } from './repositories/character-calendar.repository';
import type { CharacterFinanceRepository } from './repositories/character-finance.repository';
import type { CharacterInventoryRepository } from './repositories/character-inventory.repository';
import type { CharacterNotesRepository } from './repositories/character-notes.repository';
import type {
  CharacterDiary,
  CustomDiaryBlock,
} from './interfaces/character-diary.interface';
import type { CharacterCalendar } from './interfaces/character-calendar.interface';
import type { CharacterFinance } from './interfaces/character-finance.interface';
import type { CharacterInventory } from './interfaces/character-inventory.interface';
import type { CharacterNotes } from './interfaces/character-notes.interface';
import type { IDiarySchemaVersionsRepository } from '../worlds/diary-schema-versions/diary-schema-versions-repository.interface';
import type { SchemaBlock } from '../characters/interfaces/character.interface';
import type { ICharactersRepository } from '../characters/interfaces/characters-repository.interface';

interface CharacterCreatedPayload {
  characterId: string;
  worldId: string;
  userId?: string;
  isNpc: boolean;
  /** Spec 9.2 — `'location'` skipne diary/finance/inventory/notes (jen calendar). */
  kind?: 'persona' | 'location';
}

interface CharacterConvertedPayload {
  characterId: string;
  worldId: string;
  toNpc: boolean;
  userId?: string;
}

interface CharacterDeletedPayload {
  characterId: string;
  worldId: string;
  slug: string;
}

@Injectable()
export class CharacterSubdocsService {
  private readonly logger = new Logger(CharacterSubdocsService.name);

  constructor(
    @Inject('ICharacterDiaryRepository')
    private readonly diaryRepo: CharacterDiaryRepository,
    @Inject('ICharacterCalendarRepository')
    private readonly calendarRepo: CharacterCalendarRepository,
    @Inject('ICharacterFinanceRepository')
    private readonly financeRepo: CharacterFinanceRepository,
    @Inject('ICharacterInventoryRepository')
    private readonly inventoryRepo: CharacterInventoryRepository,
    @Inject('ICharacterNotesRepository')
    private readonly notesRepo: CharacterNotesRepository,
    // 8.5 — fallback při čtení deníku postavy bez `personalDiarySchema`
    @Inject('IDiarySchemaVersionsRepository')
    private readonly diaryVersionsRepo: IDiarySchemaVersionsRepository,
    // RC-D1 (race-condition audit) — po lazy-create subdocu re-ověř, že rodičovská
    // postava ještě existuje (mohla se mezitím smazat → orphan subdoc).
    @Inject('ICharactersRepository')
    private readonly charactersRepo: ICharactersRepository,
  ) {}

  /**
   * RC-D1 fix — po lazy-create subdokumentu ověř, že rodičovská postava pořád
   * existuje. Když se smazala v okně mezi „subdoc chybí" a `create` (souběžný
   * `character.deleted` cascade proběhl DŘÍV, než jsme vytvořili) → vzniklý
   * subdoc je orphan; smaž ho (vzor RC-D3 re-check rodiče po save). Volá se jen
   * na lazy-create cestě (čtení), ne v každém GET — overhead je minimální.
   */
  private async rollbackIfParentGone(
    characterId: string,
    deleteSubdoc: () => Promise<void>,
  ): Promise<void> {
    const parent = await this.charactersRepo.findById(characterId);
    if (!parent) {
      await deleteSubdoc().catch(() => undefined);
      throw new NotFoundException({
        code: 'CHARACTER_NOT_FOUND',
        message: 'Postava byla mezitím smazána',
      });
    }
  }

  /**
   * 8.5-BE-4 — vrátí povolené klíče pro `customData` podle nejvíc specifického
   * dostupného schématu:
   *   1. `personalDiarySchema` postavy (override má přednost)
   *   2. aktivní verze schématu světa
   * Vrací `null` pokud žádné schéma neexistuje (volající pak NEFILTRUJE — bez
   * schématu nelze rozhodnout, co je legitimní; degradace na pass-through je
   * bezpečnější než ztratit data).
   */
  private async resolveAllowedKeys(
    worldId: string,
    personalSchema?: CustomDiaryBlock[] | null,
  ): Promise<Set<string> | null> {
    // 1. Personal override (per-postava) má přednost — explicitní volba PJ/hráče.
    if (personalSchema && personalSchema.length > 0) {
      return new Set(personalSchema.map((b) => b.id));
    }
    const active = await this.diaryVersionsRepo.findActive(worldId);
    if (!active || active.schema.length === 0) return null;
    // 2. World-level whitelist platí JEN pro `generic` systém (PJ schema editor
    //    8.5, kde klíče = PJ-definované bloky). Dedikované systémy (matrix / jad /
    //    dnd5e / drd2 / …) mají vlastní FE sheet, který ukládá vlastní prefixované
    //    klíče (`jad_*`, `matrix_*`); ty v generic-style schématu nejsou → filtr
    //    by je TIŠE zahodil (data loss — JaD deník se vůbec neukládal). Pro ně
    //    pass-through, symetricky s read-side pass-through v `getDiary` (FE sheet
    //    čte jen svůj prefix, takže „cizí" klíče render neovlivní).
    if (active.system !== 'generic') return null;
    return new Set(
      active.schema.map((b: SchemaBlock) => b.key).filter(Boolean),
    );
  }

  private coerceCustomData(
    customData: Record<string, unknown> | undefined,
    allowedKeys: Set<string> | null,
  ): Record<string, unknown> {
    if (!customData) return {};
    if (!allowedKeys) return customData;
    return Object.fromEntries(
      Object.entries(customData).filter(([k]) => allowedKeys.has(k)),
    );
  }

  @OnEvent('character.created')
  async onCharacterCreated(payload: CharacterCreatedPayload): Promise<void> {
    const { characterId, worldId, kind } = payload;
    const isLocation = kind === 'location';

    // 8.1-FIR (2026-05-24) — Matrix nedělil PC/NPC/Lokaci pro Finance/Výbavu.
    // Calendar má každá entity (Spec 9.2). Finance + Inventory dostane každá
    // postava i lokace — `isNpc` už neřídí kaskádu. Deník + Poznámky zůstávají
    // jen pro persony (Lokace nemá vyprávěcí obsah postavy).
    const tasks: Promise<unknown>[] = [
      this.calendarRepo.create(characterId, worldId),
      this.financeRepo.create(characterId),
      this.inventoryRepo.create(characterId),
    ];
    if (!isLocation) {
      tasks.push(
        this.diaryRepo.create(characterId, worldId),
        this.notesRepo.create(characterId),
      );
    }
    await Promise.all(tasks);
  }

  @OnEvent('character.converted')
  async onCharacterConverted(
    payload: CharacterConvertedPayload,
  ): Promise<void> {
    const { characterId, toNpc } = payload;
    if (toNpc) {
      await Promise.all([
        this.financeRepo.update(characterId, { isHidden: true }),
        this.inventoryRepo.update(characterId, { isHidden: true }),
      ]);
    } else {
      const [finance, inventory] = await Promise.all([
        this.financeRepo.findByCharacterId(characterId),
        this.inventoryRepo.findByCharacterId(characterId),
      ]);
      await Promise.all([
        finance
          ? this.financeRepo.update(characterId, { isHidden: false })
          : this.financeRepo.create(characterId),
        inventory
          ? this.inventoryRepo.update(characterId, { isHidden: false })
          : this.inventoryRepo.create(characterId),
      ]);
    }
  }

  @OnEvent('character.deleted')
  async onCharacterDeleted(payload: CharacterDeletedPayload): Promise<void> {
    const { characterId } = payload;
    await Promise.all([
      this.diaryRepo.deleteByCharacterId(characterId),
      this.calendarRepo.deleteByCharacterId(characterId),
      this.financeRepo.deleteByCharacterId(characterId),
      this.inventoryRepo.deleteByCharacterId(characterId),
      this.notesRepo.deleteByCharacterId(characterId),
    ]);
  }

  /**
   * 2026-05-24 (8.7n) — lazy-create pro Deník (symetrie s
   * Finance/Inventory/Notes). Legacy postavy bez subdoc (např. převod
   * z Lokace na PC/NPC, kde `character.created` v Lokace skipne diary)
   * se uzdraví prvním GET. Pokud `worldId` chybí, fallback na throw
   * (BC pro starý kód, který volá bez worldId).
   */
  async getDiary(
    characterId: string,
    worldId?: string,
  ): Promise<CharacterDiary> {
    let diary = await this.diaryRepo.findByCharacterId(characterId);
    if (!diary) {
      if (!worldId) {
        throw new NotFoundException({
          code: 'DIARY_NOT_FOUND',
          message: 'Deník nenalezen',
        });
      }
      // Self-healing: vytvoř prázdný diary pro tuto postavu.
      diary = await this.diaryRepo.create(characterId, worldId);
      // RC-D1 — postava se mohla smazat během lazy-create → orphan subdoc.
      await this.rollbackIfParentGone(characterId, () =>
        this.diaryRepo.deleteByCharacterId(characterId),
      );
    }
    // 2026-05-24 (D-040-followup) — read-side coerce ODSTRANĚN. Předtím
    // filtroval `customData` proti aktivnímu schématu, ale ve spárování
    // s starým `$set` write (replace celého objektu) způsoboval DATA LOSS:
    //   1. FE dostal jen allowed keys (oříznuté staré system_* keys).
    //   2. FE poslal update s `cd = { ...allowedOnly, newKey }`.
    //   3. BE replace ničil ne-allowed keys v DB.
    // Pass-through všech customData je bezpečné: FE sheety čtou jen své
    // prefixy (`makeCdAccess(cd, 'matrix_', ...)`), takže "nečisté" keys
    // z jiných presetů nezasáhnou render. Write-side ochrana přes
    // `customDataPatch` (delta merge) + `coerceCustomData` na patch keys.
    return diary;
  }

  /**
   * Update Deníku. Dva pattern:
   *
   * 1. **`dto.customDataPatch`** (NOVÝ, doporučený 2026-05-24) — delta merge
   *    per-key přes `$set: { 'customData.<k>': v }`. Ostatní keys (např.
   *    z jiných system presetů po switchi) zůstanou nedotčené. `value: null`
   *    v patchi = `$unset` toho key. Coerce schématu se aplikuje jen na
   *    delta keys.
   *
   * 2. **`dto.customData`** (LEGACY, **deprecated**) — plně nahrazuje celý
   *    `customData` v DB. Backward compat pro starý FE; vyvolá warning v
   *    logu. Po deploy nového FE ho lze odebrat (po dostatečné rampě).
   */
  async updateDiary(
    characterId: string,
    data: Partial<CharacterDiary> & {
      customDataPatch?: Record<string, unknown>;
    },
  ): Promise<CharacterDiary> {
    const existing = await this.diaryRepo.findByCharacterId(characterId);
    if (!existing)
      throw new NotFoundException({
        code: 'DIARY_NOT_FOUND',
        message: 'Deník nenalezen',
      });

    // Pokud DTO obsahuje `personalDiarySchema` (i null), použij ten;
    // jinak ponech existující.
    const effectiveSchema =
      'personalDiarySchema' in data
        ? data.personalDiarySchema
        : existing.personalDiarySchema;
    const allowed = await this.resolveAllowedKeys(
      existing.worldId,
      effectiveSchema,
    );

    // Cesta 1: delta merge (customDataPatch).
    if (data.customDataPatch !== undefined) {
      const coercedPatch = this.coerceCustomData(data.customDataPatch, allowed);
      // Extras = všechno kromě customDataPatch a customData (sections,
      // personalDiarySchema). customData v delta módu ignorujeme — kdyby ho
      // FE omylem poslala spolu, delta vyhrává.
      const {
        customData: _legacyIgnored,
        customDataPatch: _patchIgnored,
        ...extras
      } = data;
      const updated = await this.diaryRepo.updateWithCustomDataPatch(
        characterId,
        extras,
        coercedPatch,
      );
      if (!updated)
        throw new NotFoundException({
          code: 'DIARY_NOT_FOUND',
          message: 'Deník nenalezen',
        });
      return updated;
    }

    // Cesta 2: legacy full-replace customData (deprecated).
    let payload: Partial<CharacterDiary> = data;
    if (data.customData !== undefined) {
      this.logger.warn(
        `updateDiary uses deprecated 'customData' full-replace for ${characterId}; migrate FE to 'customDataPatch'.`,
      );
      payload = {
        ...data,
        customData: this.coerceCustomData(data.customData, allowed),
      };
    }
    const updated = await this.diaryRepo.update(characterId, payload);
    if (!updated)
      throw new NotFoundException({
        code: 'DIARY_NOT_FOUND',
        message: 'Deník nenalezen',
      });
    return updated;
  }

  /**
   * 8.5 D-DIARY-2 — odstraní `personalDiarySchema` u všech postav světa.
   * Vrací počet upravených. Volá se z `WorldDiarySchemaEditorPage` jako PJ akce
   * po velké změně schématu světa, kdy chce admin sjednotit všechny postavy.
   */
  async resetAllPersonalSchemas(worldId: string): Promise<number> {
    return this.diaryRepo.clearOverridesByWorldId(worldId);
  }

  /**
   * 8.5 D-DIARY-5 — bulk přejmenování keys v customData přes všechny postavy
   * světa. Volá se z editoru šablony, pokud admin přejmenuje `key` bloku
   * (FE detekuje rename přes stabilní `id`).
   *
   * Aplikuje se jen na postavy bez `personalDiarySchema` (postava s vlastním
   * override = jiný keyspace, světový rename ji neovlivní).
   */
  async remapAllKeysByWorld(
    worldId: string,
    mapping: Record<string, string>,
  ): Promise<number> {
    if (Object.keys(mapping).length === 0) return 0;
    return this.diaryRepo.remapKeysByWorldId(worldId, mapping);
  }

  /**
   * 8.5 D-DIARY-1 — přejmenování klíčů v `customData` postavy.
   * Slouží UI: když admin změní `key` bloku v `personalDiarySchema`, FE pošle
   * mapping `{ oldKey: newKey }` a hodnoty se přemapují (jinak by je `coerce`
   * filter zahodil jako neznámé).
   */
  async remapCustomDataKeys(
    characterId: string,
    mapping: Record<string, string>,
  ): Promise<CharacterDiary> {
    const existing = await this.diaryRepo.findByCharacterId(characterId);
    if (!existing)
      throw new NotFoundException({
        code: 'DIARY_NOT_FOUND',
        message: 'Deník nenalezen',
      });
    const next: Record<string, unknown> = {};
    for (const [oldKey, value] of Object.entries(existing.customData ?? {})) {
      const newKey = mapping[oldKey] ?? oldKey;
      next[newKey] = value;
    }
    const updated = await this.diaryRepo.update(characterId, {
      customData: next,
    });
    return updated!;
  }

  /**
   * 2026-05-24 (8.7n) — lazy-create pro Kalendář (symetrie s
   * Finance/Inventory/Notes/Diary). Pokud postava nemá subdoc (legacy),
   * vytvoří se transparentně. `worldId` optional pro BC.
   */
  async getCalendar(
    characterId: string,
    worldId?: string,
  ): Promise<CharacterCalendar> {
    let calendar = await this.calendarRepo.findByCharacterId(characterId);
    if (!calendar) {
      if (!worldId) {
        throw new NotFoundException({
          code: 'CALENDAR_NOT_FOUND',
          message: 'Kalendář nenalezen',
        });
      }
      calendar = await this.calendarRepo.create(characterId, worldId);
      // RC-D1 — postava se mohla smazat během lazy-create → orphan subdoc.
      await this.rollbackIfParentGone(characterId, () =>
        this.calendarRepo.deleteByCharacterId(characterId),
      );
    }
    return calendar;
  }

  async updateCalendar(
    characterId: string,
    data: Partial<CharacterCalendar>,
  ): Promise<CharacterCalendar> {
    const updated = await this.calendarRepo.update(characterId, data);
    if (!updated)
      throw new NotFoundException({
        code: 'CALENDAR_NOT_FOUND',
        message: 'Kalendář nenalezen',
      });
    return updated;
  }

  async getCalendarsByWorldId(worldId: string): Promise<CharacterCalendar[]> {
    return this.calendarRepo.findByWorldId(worldId);
  }

  /**
   * EC-03 (2026-06-14) — Finance má jen hratelná postava (PC). NPC a Lokace
   * Finance NEMAJÍ → GET vrací 404 `FINANCE_NOT_APPLICABLE`, z čehož FE
   * (SubdocErrorState) udělá klidnou hlášku „tato postava finance nemá".
   * Pro PC lazy-create: pokud subdoc chybí (legacy / emit failure), zinicializuje se
   * transparentně bez backfill skriptu (Matrix nedělil typy postav).
   * (Budoucí změna — NPC obchodník / Lokace sklad — = odebrat gate.)
   */
  async getFinance(
    characterId: string,
    isNpc: boolean,
    kind: 'persona' | 'location',
  ): Promise<CharacterFinance> {
    if (isNpc || kind === 'location') {
      throw new NotFoundException({
        code: 'FINANCE_NOT_APPLICABLE',
        message: 'Tato postava finance nemá',
      });
    }
    const finance = await this.financeRepo.findByCharacterId(characterId);
    if (finance) return finance;
    const created = await this.financeRepo.create(characterId);
    // RC-D1 — postava se mohla smazat během lazy-create → orphan subdoc.
    await this.rollbackIfParentGone(characterId, () =>
      this.financeRepo.deleteByCharacterId(characterId),
    );
    return created;
  }

  async updateFinance(
    characterId: string,
    data: Partial<CharacterFinance>,
    isNpc: boolean,
    kind: 'persona' | 'location',
  ): Promise<CharacterFinance> {
    // FIX-12 — stejná brána jako getFinance; NPC/Lokace finance nemají.
    if (isNpc || kind === 'location') {
      throw new NotFoundException({
        code: 'FINANCE_NOT_APPLICABLE',
        message: 'Tato postava finance nemá',
      });
    }
    const updated = await this.financeRepo.update(characterId, data);
    if (!updated)
      throw new NotFoundException({
        code: 'FINANCE_NOT_FOUND',
        message: 'Finance nenalezeny',
      });
    return updated;
  }

  async addMonthly(characterId: string): Promise<CharacterFinance> {
    const finance = await this.financeRepo.findByCharacterId(characterId);
    if (!finance)
      throw new NotFoundException({
        code: 'FINANCE_NOT_FOUND',
        message: 'Finance nenalezeny',
      });

    const delta = finance.entries.reduce((sum, e) => sum + e.amount, 0);
    const transaction = {
      id: randomUUID(),
      date: new Date(),
      delta,
      description: 'měsíční zúčtování',
    };

    const updated = await this.financeRepo.update(characterId, {
      balance: finance.balance + delta,
      lastSyncDate: new Date(),
      transactions: [...finance.transactions, transaction],
    });
    return updated!;
  }

  async undoLastTransaction(characterId: string): Promise<CharacterFinance> {
    const finance = await this.financeRepo.findByCharacterId(characterId);
    if (!finance)
      throw new NotFoundException({
        code: 'FINANCE_NOT_FOUND',
        message: 'Finance nenalezeny',
      });
    if (finance.transactions.length === 0) return finance;

    const last = finance.transactions[finance.transactions.length - 1];
    const updated = await this.financeRepo.update(characterId, {
      balance: finance.balance - last.delta,
      transactions: finance.transactions.slice(0, -1),
    });
    return updated!;
  }

  /**
   * EC-03 (2026-06-14) — Výbava má jen hratelná postava (PC). NPC a Lokace
   * Výbavu NEMAJÍ → GET vrací 404 `INVENTORY_NOT_APPLICABLE`. Viz `getFinance`.
   */
  async getInventory(
    characterId: string,
    isNpc: boolean,
    kind: 'persona' | 'location',
  ): Promise<CharacterInventory> {
    if (isNpc || kind === 'location') {
      throw new NotFoundException({
        code: 'INVENTORY_NOT_APPLICABLE',
        message: 'Tato postava výbavu nemá',
      });
    }
    const inventory = await this.inventoryRepo.findByCharacterId(characterId);
    if (inventory) return inventory;
    const created = await this.inventoryRepo.create(characterId);
    // RC-D1 — postava se mohla smazat během lazy-create → orphan subdoc.
    await this.rollbackIfParentGone(characterId, () =>
      this.inventoryRepo.deleteByCharacterId(characterId),
    );
    return created;
  }

  async updateInventory(
    characterId: string,
    data: Partial<CharacterInventory>,
    isNpc: boolean,
    kind: 'persona' | 'location',
  ): Promise<CharacterInventory> {
    // FIX-12 — stejná brána jako getInventory; NPC/Lokace výbavu nemají.
    if (isNpc || kind === 'location') {
      throw new NotFoundException({
        code: 'INVENTORY_NOT_APPLICABLE',
        message: 'Tato postava výbavu nemá',
      });
    }
    const updated = await this.inventoryRepo.update(characterId, data);
    if (!updated)
      throw new NotFoundException({
        code: 'INVENTORY_NOT_FOUND',
        message: 'Výbava nenalezena',
      });
    return updated;
  }

  /**
   * RC-E4 fix — atomický append položky do výbavy (nákup z obchodu). Delegace
   * na repo `appendItemToSection` (`$push`, ne full-array `$set`). Souběžné
   * nákupy se neztratí: každý append míří na svou položku, ne na celé pole.
   *
   * `sectionId` — cílová sekce (z DTO); pokud chybí nebo neexistuje, položka
   * jde do auto-sekce `autoTitle` (vytvoří se idempotentně). Vrací id sekce +
   * položky pro purchase log a případný kompenzační rollback.
   */
  async appendInventoryItem(
    characterId: string,
    item: { text: string; quantity?: number; note?: string },
    autoTitle: string,
    sectionId?: string,
    // RC-E5 — volitelná session pro `withTransaction` scope nákupu.
    session?: ClientSession,
  ): Promise<{ sectionId: string; itemId: string }> {
    const result = await this.inventoryRepo.appendItemToSection(
      characterId,
      {
        id: randomUUID(),
        text: item.text,
        quantity: item.quantity,
        note: item.note ?? '',
      },
      { sectionId, autoTitle },
      session,
    );
    if (!result)
      throw new NotFoundException({
        code: 'INVENTORY_NOT_FOUND',
        message: 'Výbava nenalezena',
      });
    return result;
  }

  /**
   * 2026-05-24 — lazy-create pro Poznámky (analogicky k Finance/Inventory).
   * Notes je dostupné pro všechny postavy včetně Lokací (sloupek dohod s PJ).
   * Legacy postavy (před kaskádou) se uzdraví prvním GET.
   */
  async getNotes(characterId: string): Promise<CharacterNotes> {
    const notes = await this.notesRepo.findByCharacterId(characterId);
    if (notes) return notes;
    const created = await this.notesRepo.create(characterId);
    // RC-D1 — postava se mohla smazat během lazy-create → orphan subdoc.
    await this.rollbackIfParentGone(characterId, () =>
      this.notesRepo.deleteByCharacterId(characterId),
    );
    return created;
  }

  async updateNotes(
    characterId: string,
    data: Partial<CharacterNotes>,
  ): Promise<CharacterNotes> {
    const updated = await this.notesRepo.update(characterId, data);
    if (!updated)
      throw new NotFoundException({
        code: 'NOTES_NOT_FOUND',
        message: 'Poznámky nenalezeny',
      });
    return updated;
  }
}
