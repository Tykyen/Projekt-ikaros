import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { randomUUID } from 'crypto';
import type { CharacterDiaryRepository } from './repositories/character-diary.repository';
import type { CharacterCalendarRepository } from './repositories/character-calendar.repository';
import type { CharacterFinanceRepository } from './repositories/character-finance.repository';
import type { CharacterInventoryRepository } from './repositories/character-inventory.repository';
import type { CharacterNotesRepository } from './repositories/character-notes.repository';
import type { CharacterDiary } from './interfaces/character-diary.interface';
import type { CharacterCalendar } from './interfaces/character-calendar.interface';
import type { CharacterFinance } from './interfaces/character-finance.interface';
import type { CharacterInventory } from './interfaces/character-inventory.interface';
import type { CharacterNotes } from './interfaces/character-notes.interface';

interface CharacterCreatedPayload {
  characterId: string;
  worldId: string;
  userId?: string;
  isNpc: boolean;
  isLocation?: boolean;
}

interface CharacterConvertedPayload {
  characterId: string;
  worldId: string;
  toNpc: boolean;
  userId?: string;
}

@Injectable()
export class CharacterSubdocsService {
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
  ) {}

  @OnEvent('character.created')
  async onCharacterCreated(payload: CharacterCreatedPayload): Promise<void> {
    const { characterId, worldId, isNpc, isLocation } = payload;

    await this.calendarRepo.create(characterId, worldId);

    if (!isLocation) {
      await Promise.all([
        this.diaryRepo.create(characterId, worldId),
        this.notesRepo.create(characterId),
        ...(!isNpc
          ? [
              this.financeRepo.create(characterId),
              this.inventoryRepo.create(characterId),
            ]
          : []),
      ]);
    }
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

  async getDiary(characterId: string): Promise<CharacterDiary> {
    const diary = await this.diaryRepo.findByCharacterId(characterId);
    if (!diary) throw new NotFoundException('Deník nenalezen');
    return diary;
  }

  async updateDiary(
    characterId: string,
    data: Partial<CharacterDiary>,
  ): Promise<CharacterDiary> {
    const updated = await this.diaryRepo.update(characterId, data);
    if (!updated) throw new NotFoundException('Deník nenalezen');
    return updated;
  }

  async getCalendar(characterId: string): Promise<CharacterCalendar> {
    const calendar = await this.calendarRepo.findByCharacterId(characterId);
    if (!calendar) throw new NotFoundException('Kalendář nenalezen');
    return calendar;
  }

  async updateCalendar(
    characterId: string,
    data: Partial<CharacterCalendar>,
  ): Promise<CharacterCalendar> {
    const updated = await this.calendarRepo.update(characterId, data);
    if (!updated) throw new NotFoundException('Kalendář nenalezen');
    return updated;
  }

  async getCalendarsByWorldId(worldId: string): Promise<CharacterCalendar[]> {
    return this.calendarRepo.findByWorldId(worldId);
  }

  async getFinance(characterId: string): Promise<CharacterFinance> {
    const finance = await this.financeRepo.findByCharacterId(characterId);
    if (!finance) throw new NotFoundException('Finance nenalezeny');
    return finance;
  }

  async updateFinance(
    characterId: string,
    data: Partial<CharacterFinance>,
  ): Promise<CharacterFinance> {
    const updated = await this.financeRepo.update(characterId, data);
    if (!updated) throw new NotFoundException('Finance nenalezeny');
    return updated;
  }

  async addMonthly(characterId: string): Promise<CharacterFinance> {
    const finance = await this.financeRepo.findByCharacterId(characterId);
    if (!finance) throw new NotFoundException('Finance nenalezeny');

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
    if (!finance) throw new NotFoundException('Finance nenalezeny');
    if (finance.transactions.length === 0) return finance;

    const last = finance.transactions[finance.transactions.length - 1];
    const updated = await this.financeRepo.update(characterId, {
      balance: finance.balance - last.delta,
      transactions: finance.transactions.slice(0, -1),
    });
    return updated!;
  }

  async getInventory(characterId: string): Promise<CharacterInventory> {
    const inventory = await this.inventoryRepo.findByCharacterId(characterId);
    if (!inventory) throw new NotFoundException('Výbava nenalezena');
    return inventory;
  }

  async updateInventory(
    characterId: string,
    data: Partial<CharacterInventory>,
  ): Promise<CharacterInventory> {
    const updated = await this.inventoryRepo.update(characterId, data);
    if (!updated) throw new NotFoundException('Výbava nenalezena');
    return updated;
  }

  async getNotes(characterId: string): Promise<CharacterNotes> {
    const notes = await this.notesRepo.findByCharacterId(characterId);
    if (!notes) throw new NotFoundException('Poznámky nenalezeny');
    return notes;
  }

  async updateNotes(
    characterId: string,
    data: Partial<CharacterNotes>,
  ): Promise<CharacterNotes> {
    const updated = await this.notesRepo.update(characterId, data);
    if (!updated) throw new NotFoundException('Poznámky nenalezeny');
    return updated;
  }
}
