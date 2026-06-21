import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { IWorldCurrenciesRepository } from './interfaces/world-currencies-repository.interface';
import type {
  WorldCurrencies,
  WorldCurrencyItem,
} from './interfaces/world-currencies.interface';
import type { IWorldMembershipRepository } from '../worlds/interfaces/world-membership-repository.interface';
import type { IWorldsRepository } from '../worlds/interfaces/worlds-repository.interface';
import { WorldRole } from '../worlds/interfaces/world-membership.interface';
import { UserRole } from '../users/interfaces/user.interface';
import { worldAdminBypass } from '../../common/utils/world-elevation';
import type { ConvertCurrencyDto } from './dto/convert-currency.dto';

export interface CurrencyRequester {
  id: string;
  role: UserRole;
  username: string;
  elevatedWorldIds?: string[];
}

@Injectable()
export class WorldCurrenciesService {
  constructor(
    @Inject('IWorldCurrenciesRepository')
    private readonly repo: IWorldCurrenciesRepository,
    @Inject('IWorldMembershipRepository')
    private readonly membershipRepo: IWorldMembershipRepository,
    @Inject('IWorldsRepository') private readonly worldsRepo: IWorldsRepository,
  ) {}

  async getCurrencies(
    worldId: string,
    userId: string,
  ): Promise<WorldCurrencies> {
    await this.assertMember(worldId, userId);
    const doc = await this.repo.findByWorldId(worldId);
    if (!doc) return { id: '', worldId, items: [], updatedAt: new Date() };
    return doc;
  }

  async updateCurrencies(
    worldId: string,
    items: WorldCurrencyItem[],
    requester: CurrencyRequester,
  ): Promise<WorldCurrencies> {
    // Spec 11.4 §4.8b — PomocnyPJ smí edit existujících měn (rate/name/symbol),
    // ale add/delete (změna sady `code`) dál vyžaduje PJ+.
    const current = (await this.repo.findByWorldId(worldId))?.items ?? [];
    const metadataOnly = this.isMetadataOnlyEdit(current, items);
    if (metadataOnly) {
      await this.assertCanEdit(worldId, requester);
    } else {
      await this.assertCanAdmin(worldId, requester);
    }
    // DI-03 (db-integrity audit) — kód měny je lookup klíč (převody:
    // items.find(c => c.code === ...)). Embedded pole nejde indexovat na
    // uniqueness → dvě měny stejného kódu = nejednoznačný/tichý lookup. Guard zde.
    const seenCodes = new Set<string>();
    for (const item of items) {
      const code = (item.code ?? '').trim();
      if (!code) continue;
      if (seenCodes.has(code))
        throw new BadRequestException({
          code: 'CURRENCY_CODE_DUPLICATE',
          message: `Měna s kódem „${code}" je v sadě dvakrát`,
        });
      seenCodes.add(code);
    }
    const normalized = items.map((item) => ({
      ...item,
      id: item.id ?? crypto.randomUUID(),
    }));
    return this.repo.upsert(worldId, normalized);
  }

  /**
   * Spec 11.4 §4.8b — true pokud nová sada `code` je identická se starou
   * (jen edit existujících měn: rate/name/symbol). False pokud add/delete.
   */
  private isMetadataOnlyEdit(
    oldItems: WorldCurrencyItem[],
    newItems: WorldCurrencyItem[],
  ): boolean {
    if (oldItems.length !== newItems.length) return false;
    const oldCodes = new Set(oldItems.map((i) => i.code));
    return newItems.every((i) => oldCodes.has(i.code));
  }

  async convert(
    worldId: string,
    dto: ConvertCurrencyDto,
    userId: string,
  ): Promise<{ from: string; to: string; amount: number; result: number }> {
    await this.assertMember(worldId, userId);
    const doc = await this.repo.findByWorldId(worldId);
    const items = doc?.items ?? [];

    if (dto.from === dto.to)
      throw new BadRequestException({
        code: 'CURRENCY_SAME_FROM_TO',
        message: 'from a to musí být různé',
      });

    const fromCurrency = items.find((c) => c.code === dto.from);
    const toCurrency = items.find((c) => c.code === dto.to);

    if (!fromCurrency)
      throw new BadRequestException({
        code: 'CURRENCY_NOT_FOUND',
        message: `Měna '${dto.from}' neexistuje`,
      });
    if (!toCurrency)
      throw new BadRequestException({
        code: 'CURRENCY_NOT_FOUND',
        message: `Měna '${dto.to}' neexistuje`,
      });

    const raw = dto.amount * (fromCurrency.rate / toCurrency.rate);
    const result = Math.round(raw * 10000) / 10000;

    return { from: dto.from, to: dto.to, amount: dto.amount, result };
  }

  /**
   * Interní — raw seznam měn světa (kurzy) pro převody z jiných modulů
   * (např. přepočet měny účtu). Bez member-assertu; přístup gatuje volající
   * (account settings permission). Chybí dokument → prázdné pole.
   */
  async getItems(worldId: string): Promise<WorldCurrencyItem[]> {
    const doc = await this.repo.findByWorldId(worldId);
    return doc?.items ?? [];
  }

  async seedForWorld(worldId: string, genre?: string): Promise<void> {
    const items = this.getItemsForGenre(genre);
    await this.repo.upsert(worldId, items);
  }

  private getItemsForGenre(genre?: string): WorldCurrencyItem[] {
    const id = () => crypto.randomUUID();
    const fantasy = [
      'fantasy',
      'dark-fantasy',
      'heroic-fantasy',
      'sword-sorcery',
      'grimdark',
      'mytologicky',
    ];
    const cyber = [
      'cyberpunk',
      'sci-fi',
      'hard-sci-fi',
      'soft-sci-fi',
      'biopunk',
    ];
    const space = ['space-opera', 'military'];
    const postapo = ['postapo', 'post-postapo', 'dieselpunk'];

    if (genre && fantasy.includes(genre)) {
      return [
        { id: id(), code: 'ZL', name: 'Zlaťák', symbol: 'Zl', rate: 1.0 },
        { id: id(), code: 'ST', name: 'Stříbrňák', symbol: 'St', rate: 0.1 },
        { id: id(), code: 'MD', name: 'Měďák', symbol: 'Md', rate: 0.01 },
      ];
    }
    if (genre && cyber.includes(genre)) {
      return [
        { id: id(), code: 'CR', name: 'Kredit', symbol: 'Cr', rate: 1.0 },
        { id: id(), code: 'NUSD', name: 'NUSA Dolar', symbol: '$', rate: 2.5 },
      ];
    }
    if (genre && space.includes(genre)) {
      return [
        { id: id(), code: 'CR', name: 'Kredit', symbol: 'Cr', rate: 1.0 },
        { id: id(), code: 'KR', name: 'Krystal', symbol: 'Kr', rate: 100.0 },
      ];
    }
    if (genre && postapo.includes(genre)) {
      return [
        { id: id(), code: 'ZAT', name: 'Zátka', symbol: 'Zt', rate: 1.0 },
        { id: id(), code: 'PR', name: 'Příděl', symbol: 'Př', rate: 50.0 },
      ];
    }
    return [{ id: id(), code: 'MNC', name: 'Mince', symbol: 'Mn', rate: 1.0 }];
  }

  private async assertMember(worldId: string, userId: string): Promise<void> {
    const world = await this.worldsRepo.findById(worldId);
    if (!world)
      throw new NotFoundException({
        code: 'WORLD_NOT_FOUND',
        message: 'Svět nenalezen',
      });
    const membership = await this.membershipRepo.findByUserAndWorld(
      userId,
      worldId,
    );
    if (!membership)
      throw new ForbiddenException({
        code: 'NOT_WORLD_MEMBER',
        message: 'Nejsi členem tohoto světa',
      });
  }

  private async assertCanAdmin(
    worldId: string,
    requester: CurrencyRequester,
  ): Promise<void> {
    const world = await this.worldsRepo.findById(worldId);
    if (!world)
      throw new NotFoundException({
        code: 'WORLD_NOT_FOUND',
        message: 'Svět nenalezen',
      });
    if (worldAdminBypass(requester, worldId)) return;
    const membership = await this.membershipRepo.findByUserAndWorld(
      requester.id,
      worldId,
    );
    if (!membership || membership.role < WorldRole.PJ)
      throw new ForbiddenException({
        code: 'CURRENCY_FORBIDDEN',
        message: 'Přidat / smazat měnu může jen PJ nebo Admin',
      });
  }

  /**
   * Spec 11.4 §4.8b — měkčí varianta `assertCanAdmin` pro PomocnyPJ+.
   * Volá se z `updateCurrencies` jen pokud `isMetadataOnlyEdit === true`.
   */
  private async assertCanEdit(
    worldId: string,
    requester: CurrencyRequester,
  ): Promise<void> {
    const world = await this.worldsRepo.findById(worldId);
    if (!world)
      throw new NotFoundException({
        code: 'WORLD_NOT_FOUND',
        message: 'Svět nenalezen',
      });
    if (worldAdminBypass(requester, worldId)) return;
    const membership = await this.membershipRepo.findByUserAndWorld(
      requester.id,
      worldId,
    );
    if (!membership || membership.role < WorldRole.PomocnyPJ)
      throw new ForbiddenException({
        code: 'CURRENCY_FORBIDDEN_EDIT',
        message: 'Upravovat měny může jen Pomocný PJ a vyšší',
      });
  }
}
