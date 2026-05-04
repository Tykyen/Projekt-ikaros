import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { IWorldCurrenciesRepository } from './interfaces/world-currencies-repository.interface';
import type { WorldCurrencies, WorldCurrencyItem } from './interfaces/world-currencies.interface';
import type { IWorldMembershipRepository } from '../worlds/interfaces/world-membership-repository.interface';
import type { IWorldsRepository } from '../worlds/interfaces/worlds-repository.interface';
import { WorldRole } from '../worlds/interfaces/world-membership.interface';
import { UserRole } from '../users/interfaces/user.interface';
import type { ConvertCurrencyDto } from './dto/convert-currency.dto';

export interface CurrencyRequester {
  id: string;
  role: UserRole;
  username: string;
}

@Injectable()
export class WorldCurrenciesService {
  constructor(
    @Inject('IWorldCurrenciesRepository') private readonly repo: IWorldCurrenciesRepository,
    @Inject('IWorldMembershipRepository') private readonly membershipRepo: IWorldMembershipRepository,
    @Inject('IWorldsRepository') private readonly worldsRepo: IWorldsRepository,
  ) {}

  async getCurrencies(worldId: string, userId: string): Promise<WorldCurrencies> {
    await this.assertMember(worldId, userId);
    const doc = await this.repo.findByWorldId(worldId);
    if (!doc) return { id: '', worldId, items: [], updatedAt: new Date() };
    return doc;
  }

  async updateCurrencies(worldId: string, items: WorldCurrencyItem[], requester: CurrencyRequester): Promise<WorldCurrencies> {
    await this.assertCanAdmin(worldId, requester);
    const normalized = items.map((item) => ({
      ...item,
      id: item.id ?? crypto.randomUUID(),
    }));
    return this.repo.upsert(worldId, normalized);
  }

  async convert(worldId: string, dto: ConvertCurrencyDto, userId: string): Promise<{ from: string; to: string; amount: number; result: number }> {
    await this.assertMember(worldId, userId);
    const doc = await this.repo.findByWorldId(worldId);
    const items = doc?.items ?? [];

    if (dto.from === dto.to) throw new BadRequestException('from a to musí být různé');

    const fromCurrency = items.find((c) => c.code === dto.from);
    const toCurrency = items.find((c) => c.code === dto.to);

    if (!fromCurrency) throw new BadRequestException(`Měna '${dto.from}' neexistuje`);
    if (!toCurrency) throw new BadRequestException(`Měna '${dto.to}' neexistuje`);

    const raw = dto.amount * (fromCurrency.rate / toCurrency.rate);
    const result = Math.round(raw * 10000) / 10000;

    return { from: dto.from, to: dto.to, amount: dto.amount, result };
  }

  async seedForWorld(worldId: string, genre?: string): Promise<void> {
    const items = this.getItemsForGenre(genre);
    await this.repo.upsert(worldId, items);
  }

  private getItemsForGenre(genre?: string): WorldCurrencyItem[] {
    const id = () => crypto.randomUUID();
    const fantasy = ['fantasy', 'dark-fantasy', 'heroic-fantasy', 'sword-sorcery', 'grimdark', 'mytologicky'];
    const cyber = ['cyberpunk', 'sci-fi', 'hard-sci-fi', 'soft-sci-fi', 'biopunk'];
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
    if (!world) throw new NotFoundException('Svět nenalezen');
    const membership = await this.membershipRepo.findByUserAndWorld(userId, worldId);
    if (!membership) throw new ForbiddenException('Nejsi členem tohoto světa');
  }

  private async assertCanAdmin(worldId: string, requester: CurrencyRequester): Promise<void> {
    const world = await this.worldsRepo.findById(worldId);
    if (!world) throw new NotFoundException('Svět nenalezen');
    if (requester.role <= UserRole.Admin) return;
    const membership = await this.membershipRepo.findByUserAndWorld(requester.id, worldId);
    if (!membership || membership.role < WorldRole.PJ) throw new ForbiddenException('Nedostatečná oprávnění');
  }
}
