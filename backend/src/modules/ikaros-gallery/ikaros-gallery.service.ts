import {
  Injectable,
  Inject,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import type { IIkarosGalleryRepository } from './interfaces/ikaros-gallery-repository.interface';
import type { IkarosGalleryItem } from './interfaces/ikaros-gallery.interface';
import type { IUsersRepository } from '../users/interfaces/users-repository.interface';
import type { IkarosMessagesService } from '../ikaros-messages/ikaros-messages.service';
import type { UploadService } from '../upload/upload.service';
import { UserRole } from '../users/interfaces/user.interface';
import type { CreateGalleryItemDto } from './dto/create-gallery-item.dto';
import type { UpdateGalleryItemDto } from './dto/update-gallery-item.dto';

const ADMIN_ROLES = [
  UserRole.Superadmin,
  UserRole.Admin,
  UserRole.PJ,
  UserRole.SpravceGalerie,
];
const SYSTEM_SENDER = { id: 'system', username: 'Systém' };

@Injectable()
export class IkarosGalleryService {
  constructor(
    @Inject('IIkarosGalleryRepository')
    private readonly repo: IIkarosGalleryRepository,
    @Inject('IUsersRepository') private readonly usersRepo: IUsersRepository,
    @Inject('IkarosMessagesService')
    private readonly msgService: IkarosMessagesService,
    @Inject('UploadService') private readonly uploadService: UploadService,
  ) {}

  isAdmin(role: UserRole, username: string): boolean {
    return ADMIN_ROLES.includes(role) || username === 'Tyky';
  }

  private assertAdmin(role: UserRole, username: string): void {
    if (!this.isAdmin(role, username))
      throw new ForbiddenException('Nedostatečná oprávnění');
  }

  private async notifyAdmins(subject: string, body: string): Promise<void> {
    const admins = await this.usersRepo.findByRoles(ADMIN_ROLES);
    const tyky = await this.usersRepo.findByUsername('Tyky');
    const recipients = [...admins];
    if (tyky && !admins.some((a) => a.id === tyky.id)) recipients.push(tyky);
    await Promise.all(
      recipients.map((r) =>
        this.msgService.create(
          { recipientId: r.id, recipientName: r.username, subject, body },
          SYSTEM_SENDER,
        ),
      ),
    );
  }

  private async notifyUser(
    recipientId: string,
    recipientName: string,
    subject: string,
    body: string,
  ): Promise<void> {
    await this.msgService.create(
      { recipientId, recipientName, subject, body },
      SYSTEM_SENDER,
    );
  }

  async findAll(
    role: UserRole,
    username: string,
  ): Promise<IkarosGalleryItem[]> {
    if (this.isAdmin(role, username))
      return this.repo.findPublishedAndPending();
    return this.repo.findPublished();
  }

  async findMy(authorId: string): Promise<IkarosGalleryItem[]> {
    return this.repo.findByAuthor(authorId);
  }

  async findPending(
    role: UserRole,
    username: string,
  ): Promise<IkarosGalleryItem[]> {
    this.assertAdmin(role, username);
    return this.repo.findPending();
  }

  async findById(
    id: string,
    userId: string,
    role: UserRole,
    username: string,
  ): Promise<IkarosGalleryItem> {
    const item = await this.repo.findById(id);
    if (!item) throw new NotFoundException('Obrázek nenalezen');
    if (
      item.status !== 'Published' &&
      item.authorId !== userId &&
      !this.isAdmin(role, username)
    ) {
      throw new ForbiddenException('Přístup odepřen');
    }
    return item;
  }

  async create(
    dto: CreateGalleryItemDto,
    file: Express.Multer.File,
    authorId: string,
    authorName: string,
    _role: UserRole,
  ): Promise<IkarosGalleryItem> {
    const { url } = await this.uploadService.uploadGalleryImage(file);
    const status = dto.submit ? 'Pending' : 'Draft';
    const item = await this.repo.create({
      title: dto.title,
      description: dto.description,
      imageUrl: url,
      authorId,
      authorName,
      status,
      ratings: [],
      averageRating: 0,
      createdAtUtc: new Date(),
      updatedAtUtc: new Date(),
    });
    if (status === 'Pending') {
      await this.notifyAdmins(
        'Obrázek čeká na schválení',
        `/ikaros/galerie/${item.id}`,
      );
    }
    return item;
  }

  async update(
    id: string,
    dto: UpdateGalleryItemDto,
    userId: string,
    _role: UserRole,
    _username: string,
  ): Promise<IkarosGalleryItem> {
    const item = await this.repo.findById(id);
    if (!item) throw new NotFoundException('Obrázek nenalezen');
    if (item.authorId !== userId)
      throw new ForbiddenException('Přístup odepřen');
    if (item.status !== 'Draft' && item.status !== 'Rejected') {
      throw new BadRequestException(
        'Editovat lze jen Draft nebo Rejected obrázek',
      );
    }
    const updated = await this.repo.update(id, {
      ...dto,
      updatedAtUtc: new Date(),
    });
    return updated!;
  }

  async delete(
    id: string,
    userId: string,
    role: UserRole,
    username: string,
  ): Promise<void> {
    const item = await this.repo.findById(id);
    if (!item) throw new NotFoundException('Obrázek nenalezen');
    if (item.authorId !== userId && !this.isAdmin(role, username)) {
      throw new ForbiddenException('Přístup odepřen');
    }
    await this.repo.delete(id);
  }

  async submit(
    id: string,
    userId: string,
    _role: UserRole,
  ): Promise<IkarosGalleryItem> {
    const item = await this.repo.findById(id);
    if (!item) throw new NotFoundException('Obrázek nenalezen');
    if (item.authorId !== userId)
      throw new ForbiddenException('Přístup odepřen');
    if (item.status !== 'Draft' && item.status !== 'Rejected') {
      throw new BadRequestException(
        'Odeslat lze jen Draft nebo Rejected obrázek',
      );
    }
    const updated = await this.repo.update(id, {
      status: 'Pending',
      updatedAtUtc: new Date(),
    });
    await this.notifyAdmins(
      'Obrázek čeká na schválení',
      `/ikaros/galerie/${id}`,
    );
    return updated!;
  }

  async approve(
    id: string,
    role: UserRole,
    username: string,
  ): Promise<IkarosGalleryItem> {
    this.assertAdmin(role, username);
    const item = await this.repo.findById(id);
    if (!item) throw new NotFoundException('Obrázek nenalezen');
    if (item.status !== 'Pending')
      throw new BadRequestException('Schválit lze jen Pending obrázek');
    const updated = await this.repo.update(id, {
      status: 'Published',
      publishedAtUtc: new Date(),
      updatedAtUtc: new Date(),
    });
    await this.notifyUser(
      item.authorId,
      item.authorName,
      'Obrázek schválen',
      `Tvůj obrázek "${item.title}" byl schválen.`,
    );
    return updated!;
  }

  async reject(
    id: string,
    reason: string | undefined,
    role: UserRole,
    username: string,
  ): Promise<IkarosGalleryItem> {
    this.assertAdmin(role, username);
    const item = await this.repo.findById(id);
    if (!item) throw new NotFoundException('Obrázek nenalezen');
    if (item.status !== 'Pending')
      throw new BadRequestException('Zamítnout lze jen Pending obrázek');
    const updated = await this.repo.update(id, {
      status: 'Rejected',
      rejectReason: reason,
      updatedAtUtc: new Date(),
    });
    const body = reason
      ? `Důvod zamítnutí: ${reason}`
      : `Tvůj obrázek "${item.title}" byl zamítnut.`;
    await this.notifyUser(
      item.authorId,
      item.authorName,
      'Obrázek zamítnut',
      body,
    );
    return updated!;
  }

  async rate(
    id: string,
    stars: number,
    userId: string,
    _role: UserRole,
  ): Promise<{ averageRating: number; totalRatings: number }> {
    const item = await this.repo.findById(id);
    if (!item) throw new NotFoundException('Obrázek nenalezen');
    if (item.status !== 'Published')
      throw new BadRequestException('Hodnotit lze jen Published obrázek');
    if (item.authorId === userId)
      throw new ForbiddenException('Autor nemůže hodnotit vlastní obrázek');
    const updated = await this.repo.upsertRating(id, { userId, stars });
    return {
      averageRating: updated?.averageRating ?? 0,
      totalRatings: updated?.ratings.length ?? 0,
    };
  }
}
