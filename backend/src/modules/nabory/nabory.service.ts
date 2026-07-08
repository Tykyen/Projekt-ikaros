import {
  Injectable,
  Inject,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type { INaboryRepository } from './interfaces/nabory-repository.interface';
import type {
  Nabor,
  NaborStrana,
  NaborMotiv,
  NaborMode,
  NaborStatus,
} from './interfaces/nabor.interface';
import type { IkarosMessagesService } from '../ikaros-messages/ikaros-messages.service';
import { UserRole } from '../users/interfaces/user.interface';
import type { CreateNaborDto } from './dto/create-nabor.dto';
import type { PatchNaborDto } from './dto/patch-nabor.dto';

// 19.3 — nábor je platformový obsah → moderace jen globální role (žádný world PJ).
const ADMIN_ROLES = [
  UserRole.Superadmin,
  UserRole.Admin,
  UserRole.SpravceDiskuzi,
];
const EXPIRY_DAYS = 30;

@Injectable()
export class NaboryService {
  constructor(
    @Inject('INaboryRepository')
    private readonly repo: INaboryRepository,
    @Inject('IkarosMessagesService')
    private readonly msgService: IkarosMessagesService,
  ) {}

  isAdmin(role: UserRole): boolean {
    return ADMIN_ROLES.includes(role);
  }

  private assertAuthorOrAdmin(
    nabor: Nabor,
    userId: string,
    role: UserRole,
  ): void {
    if (nabor.authorId !== userId && !this.isAdmin(role)) {
      throw new ForbiddenException({
        code: 'NABOR_FORBIDDEN',
        message: 'Nedostatečná oprávnění',
      });
    }
  }

  private async getOr404(id: string): Promise<Nabor> {
    const n = await this.repo.findById(id);
    if (!n)
      throw new NotFoundException({
        code: 'NABOR_NOT_FOUND',
        message: 'Nábor nenalezen',
      });
    return n;
  }

  findAll(): Promise<Nabor[]> {
    return this.repo.findActive();
  }

  findById(id: string): Promise<Nabor> {
    return this.getOr404(id);
  }

  create(
    dto: CreateNaborDto,
    userId: string,
    username: string,
  ): Promise<Nabor> {
    const isPj = dto.strana === 'hledam-hrace';
    const expiresAtUtc = new Date(Date.now() + EXPIRY_DAYS * 86_400_000);
    return this.repo.create({
      strana: dto.strana as NaborStrana,
      motiv: dto.motiv as NaborMotiv,
      worldId: isPj ? dto.worldId : undefined,
      title: dto.title,
      body: dto.body,
      imageUrl: dto.imageUrl,
      system: dto.system,
      mode: dto.mode as NaborMode,
      place: dto.mode === 'zivo' ? dto.place : undefined,
      seatsTotal: isPj ? dto.seatsTotal : undefined,
      seatsTaken: 0,
      status: 'open',
      authorId: userId,
      authorName: username,
      createdAtUtc: new Date(),
      expiresAtUtc,
    });
  }

  async patch(
    id: string,
    dto: PatchNaborDto,
    userId: string,
    role: UserRole,
  ): Promise<Nabor> {
    const nabor = await this.getOr404(id);
    this.assertAuthorOrAdmin(nabor, userId, role);

    const update: Partial<Nabor> = {};
    if (dto.title !== undefined) update.title = dto.title;
    if (dto.body !== undefined) update.body = dto.body;
    if (dto.motiv !== undefined) update.motiv = dto.motiv as NaborMotiv;
    if (dto.system !== undefined) update.system = dto.system;
    if (dto.mode !== undefined) update.mode = dto.mode as NaborMode;
    if (dto.place !== undefined) update.place = dto.place;
    if (dto.imageUrl !== undefined) update.imageUrl = dto.imageUrl;
    if (dto.seatsTotal !== undefined) update.seatsTotal = dto.seatsTotal;
    if (dto.seatsTaken !== undefined) update.seatsTaken = dto.seatsTaken;
    if (dto.status !== undefined) update.status = dto.status as NaborStatus;

    const res = await this.repo.update(id, update);
    return res ?? nabor;
  }

  async delete(id: string, userId: string, role: UserRole): Promise<void> {
    const nabor = await this.getOr404(id);
    this.assertAuthorOrAdmin(nabor, userId, role);
    await this.repo.delete(id);
  }

  /** „Ozvat se" — přímá zpráva autorovi (veřejný nábor obchází friend-only). */
  async ozvatSe(
    id: string,
    message: string,
    senderId: string,
    senderUsername: string,
  ): Promise<{ ok: true }> {
    const nabor = await this.getOr404(id);
    if (nabor.authorId === senderId) {
      throw new ForbiddenException({
        code: 'NABOR_SELF_CONTACT',
        message: 'Na vlastní nábor se ozvat nelze',
      });
    }
    await this.msgService.create(
      {
        recipientId: nabor.authorId,
        recipientName: nabor.authorName,
        subject: `Nábor: ${nabor.title}`,
        body: message,
      },
      // sender bez role → nábor je veřejná výzva, obejde friend-only check.
      { id: senderId, username: senderUsername },
    );
    return { ok: true };
  }

  /** Nahlášení (post-moderace) — idempotentní; moderátoři vidí `reportCount`. */
  async report(id: string, userId: string): Promise<{ ok: true }> {
    await this.getOr404(id);
    await this.repo.addReport(id, userId);
    return { ok: true };
  }
}
