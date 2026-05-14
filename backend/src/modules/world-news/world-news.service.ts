import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { IWorldNewsRepository } from './interfaces/world-news-repository.interface';
import type { WorldNewsItem } from './interfaces/world-news.interface';
import type { IWorldMembershipRepository } from '../worlds/interfaces/world-membership-repository.interface';
import type { IWorldsRepository } from '../worlds/interfaces/worlds-repository.interface';
import { WorldRole } from '../worlds/interfaces/world-membership.interface';
import { UserRole } from '../users/interfaces/user.interface';
import type { CreateWorldNewsDto } from './dto/create-world-news.dto';
import type { UpdateWorldNewsDto } from './dto/update-world-news.dto';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

interface FindManyArgs {
  worldId?: string;
  limit?: number;
}

export interface WorldNewsRequester {
  id: string;
  role: UserRole;
  username: string;
}

@Injectable()
export class WorldNewsService {
  constructor(
    @Inject('IWorldNewsRepository')
    private readonly repo: IWorldNewsRepository,
    @Inject('IWorldMembershipRepository')
    private readonly membershipRepo: IWorldMembershipRepository,
    @Inject('IWorldsRepository')
    private readonly worldsRepo: IWorldsRepository,
  ) {}

  async findMany(args: FindManyArgs): Promise<WorldNewsItem[]> {
    const limit = Math.max(1, Math.min(args.limit ?? DEFAULT_LIMIT, MAX_LIMIT));
    return this.repo.findMany({ worldId: args.worldId, limit });
  }

  async findById(id: string): Promise<WorldNewsItem> {
    const item = await this.repo.findById(id);
    if (!item) throw new NotFoundException('Novinka nenalezena');
    return item;
  }

  async create(
    dto: CreateWorldNewsDto,
    requester: WorldNewsRequester,
  ): Promise<WorldNewsItem> {
    const worldId = dto.worldId ?? null;
    await this.assertCanWrite(worldId, requester);

    return this.repo.create({
      worldId,
      title: dto.title,
      content: dto.content,
      date: dto.date ?? new Date().toISOString(),
      type: dto.type ?? 'info',
      link: dto.link,
      createdBy: requester.id,
    });
  }

  async update(
    id: string,
    dto: UpdateWorldNewsDto,
    requester: WorldNewsRequester,
  ): Promise<WorldNewsItem> {
    const existing = await this.repo.findById(id);
    if (!existing) throw new NotFoundException('Novinka nenalezena');

    // Immutable worldId — pokud klient pošle (i identicky), 400.
    // class-validator ten field nepouští dál; tahle kontrola je defense-in-depth
    // pro případ že DTO whitelist selže.
    if ('worldId' in (dto as Record<string, unknown>)) {
      throw new BadRequestException(
        'worldId je immutable — smaž a vytvoř novou novinku pro změnu scope',
      );
    }

    await this.assertCanWrite(existing.worldId, requester);

    const updated = await this.repo.update(id, {
      ...(dto.title !== undefined && { title: dto.title }),
      ...(dto.content !== undefined && { content: dto.content }),
      ...(dto.date !== undefined && { date: dto.date }),
      ...(dto.type !== undefined && { type: dto.type }),
      ...(dto.link !== undefined && { link: dto.link }),
    });
    if (!updated) throw new NotFoundException('Novinka nenalezena');
    return updated;
  }

  async delete(id: string, requester: WorldNewsRequester): Promise<void> {
    const existing = await this.repo.findById(id);
    if (!existing) throw new NotFoundException('Novinka nenalezena');

    await this.assertCanWrite(existing.worldId, requester);

    const deleted = await this.repo.delete(id);
    if (!deleted) throw new NotFoundException('Novinka nenalezena');
  }

  /**
   * Auth pravidla:
   * - Admin/Superadmin smí vždy (role 1 nebo 2; nižší = vyšší)
   * - worldId === null → jen Admin/Superadmin
   * - worldId !== null → Admin/Superadmin NEBO WorldRole >= PomocnyPJ
   * - Anti-leak: neexistující svět = 403 (ne 404), aby anonymní spoofing
   *   neodhalil existenci
   */
  private async assertCanWrite(
    worldId: string | null,
    requester: WorldNewsRequester,
  ): Promise<void> {
    // UserRole.Superadmin = 1, UserRole.Admin = 2 (menší číslo = vyšší role)
    if (requester.role <= UserRole.Admin) return;

    if (worldId === null) {
      throw new ForbiddenException(
        'Pouze Admin/Superadmin smí měnit globální novinky',
      );
    }

    const world = await this.worldsRepo.findById(worldId);
    if (!world) throw new ForbiddenException('Nedostatečná oprávnění');

    const membership = await this.membershipRepo.findByUserAndWorld(
      requester.id,
      worldId,
    );
    if (!membership) throw new ForbiddenException('Nedostatečná oprávnění');
    if (membership.role < WorldRole.PomocnyPJ) {
      throw new ForbiddenException('Nedostatečná oprávnění');
    }
  }
}
