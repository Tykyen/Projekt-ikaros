# Krok 11c — IkarosGallery: Implementační plán

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Vytvořit modul `ikaros-gallery` — galerie obrázků s workflow identickým jako Articles, upload přes Cloudinary (UploadService).

**Architecture:** Samostatný NestJS modul s kolekcí `ikaros_gallery`. POST endpoint přijme `multipart/form-data`, zavolá `UploadService.uploadGalleryImage()` (nová metoda v Task 1). Admin check zahrnuje navíc `SpravceGalerie`. DELETE odstraní jen DB záznam, Cloudinary soubor se nesmaže.

**Tech Stack:** NestJS, Mongoose, Multer, Cloudinary, class-validator, Jest

**Předpoklad:** Kroky 11a a 11b musí být hotovy (`UserRole` enum, `IUsersRepository.findByRoles`).

---

## Přehled souborů

| Soubor | Akce | Zodpovědnost |
|--------|------|--------------|
| `backend/src/modules/upload/upload.service.ts` | Upravit | Přidat `uploadGalleryImage(file)` metodu |
| `backend/src/modules/upload/upload.module.ts` | Upravit | Exportovat `UploadService` |
| `backend/src/modules/ikaros-gallery/interfaces/ikaros-gallery.interface.ts` | Vytvořit | TypeScript interface |
| `backend/src/modules/ikaros-gallery/interfaces/ikaros-gallery-repository.interface.ts` | Vytvořit | Repository interface |
| `backend/src/modules/ikaros-gallery/schemas/ikaros-gallery.schema.ts` | Vytvořit | Mongoose schema, kolekce `ikaros_gallery` |
| `backend/src/modules/ikaros-gallery/repositories/ikaros-gallery.repository.ts` | Vytvořit | MongoDB implementace |
| `backend/src/modules/ikaros-gallery/dto/create-gallery-item.dto.ts` | Vytvořit | Validace POST (multipart) |
| `backend/src/modules/ikaros-gallery/dto/update-gallery-item.dto.ts` | Vytvořit | Validace PUT |
| `backend/src/modules/ikaros-gallery/dto/rate-gallery-item.dto.ts` | Vytvořit | Validace POST /rate |
| `backend/src/modules/ikaros-gallery/dto/reject-gallery-item.dto.ts` | Vytvořit | Validace POST /reject |
| `backend/src/modules/ikaros-gallery/ikaros-gallery.service.ts` | Vytvořit | Business logika + notifikace |
| `backend/src/modules/ikaros-gallery/ikaros-gallery.service.spec.ts` | Vytvořit | Unit testy |
| `backend/src/modules/ikaros-gallery/ikaros-gallery.controller.ts` | Vytvořit | HTTP endpointy |
| `backend/src/modules/ikaros-gallery/ikaros-gallery.module.ts` | Vytvořit | NestJS modul |
| `backend/src/app.module.ts` | Upravit | Přidat `IkarosGalleryModule` |
| `docs/roadmap.md` | Upravit | Označit krok 11c jako ✅ |

---

## Task 1: Rozšíření UploadService

**Files:**
- Modify: `backend/src/modules/upload/upload.service.ts`
- Modify: `backend/src/modules/upload/upload.module.ts`

- [ ] **Step 1: Přidat `uploadGalleryImage` metodu do UploadService**

V souboru `backend/src/modules/upload/upload.service.ts` přidej metodu na konec třídy `UploadService`:

```typescript
async uploadGalleryImage(file: Express.Multer.File): Promise<{ url: string; publicId: string }> {
  const allowedImageTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];
  if (!allowedImageTypes.includes(file.mimetype)) {
    throw new UnsupportedMediaTypeException(`Nepodporovaný typ souboru: ${file.mimetype}`);
  }

  let result: { secure_url: string; public_id: string };
  try {
    result = await new Promise((resolve, reject) => {
      cloudinary.uploader
        .upload_stream(
          { folder: 'gallery', resource_type: 'image' },
          (err, res) => {
            if (err || !res) reject(err ?? new Error('Cloudinary: no response'));
            else resolve(res as { secure_url: string; public_id: string });
          },
        )
        .end(file.buffer);
    });
  } catch {
    throw new BadGatewayException('Chyba při nahrávání obrázku na Cloudinary');
  }

  return { url: result.secure_url, publicId: result.public_id };
}
```

- [ ] **Step 2: Exportovat UploadService z UploadModule**

V `backend/src/modules/upload/upload.module.ts` přidej `exports`:

```typescript
@Module({
  imports: [ChatModule],
  controllers: [UploadController],
  providers: [UploadService],
  exports: [UploadService],
})
export class UploadModule {}
```

- [ ] **Step 3: Ověřit kompilaci**

```bash
cd backend && npx tsc --noEmit
```
Očekáváno: žádné chyby.

- [ ] **Step 4: Commit**

```bash
git add backend/src/modules/upload/upload.service.ts backend/src/modules/upload/upload.module.ts
git commit -m "feat(upload): přidat uploadGalleryImage, exportovat UploadService"
```

---

## Task 2: Interface + Schema + Repository Interface

**Files:**
- Create: `backend/src/modules/ikaros-gallery/interfaces/ikaros-gallery.interface.ts`
- Create: `backend/src/modules/ikaros-gallery/interfaces/ikaros-gallery-repository.interface.ts`
- Create: `backend/src/modules/ikaros-gallery/schemas/ikaros-gallery.schema.ts`

- [ ] **Step 1: Vytvořit interface**

```typescript
// backend/src/modules/ikaros-gallery/interfaces/ikaros-gallery.interface.ts
export type GalleryStatus = 'Draft' | 'Pending' | 'Published' | 'Rejected';

export interface GalleryRating {
  userId: string;
  stars: number;
}

export interface IkarosGalleryItem {
  id: string;
  title: string;
  description?: string;
  imageUrl: string;
  authorId: string;
  authorName: string;
  status: GalleryStatus;
  rejectReason?: string;
  ratings: GalleryRating[];
  averageRating: number;
  createdAtUtc: Date;
  updatedAtUtc: Date;
  publishedAtUtc?: Date;
}
```

- [ ] **Step 2: Vytvořit repository interface**

```typescript
// backend/src/modules/ikaros-gallery/interfaces/ikaros-gallery-repository.interface.ts
import type { IkarosGalleryItem, GalleryStatus, GalleryRating } from './ikaros-gallery.interface';

export interface IIkarosGalleryRepository {
  findPublished(): Promise<IkarosGalleryItem[]>;
  findPublishedAndPending(): Promise<IkarosGalleryItem[]>;
  findPending(): Promise<IkarosGalleryItem[]>;
  findByAuthor(authorId: string): Promise<IkarosGalleryItem[]>;
  findById(id: string): Promise<IkarosGalleryItem | null>;
  create(data: Omit<IkarosGalleryItem, 'id'>): Promise<IkarosGalleryItem>;
  update(id: string, data: Partial<IkarosGalleryItem>): Promise<IkarosGalleryItem | null>;
  upsertRating(id: string, rating: GalleryRating): Promise<IkarosGalleryItem | null>;
  delete(id: string): Promise<boolean>;
  countByAuthorAndStatus(authorId: string): Promise<Record<GalleryStatus, number>>;
}
```

- [ ] **Step 3: Vytvořit Mongoose schema**

```typescript
// backend/src/modules/ikaros-gallery/schemas/ikaros-gallery.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

class GalleryRatingSchema {
  @Prop({ required: true }) userId: string;
  @Prop({ required: true, min: 1, max: 5 }) stars: number;
}

export type IkarosGalleryDocument = HydratedDocument<IkarosGallerySchemaClass>;

@Schema({ collection: 'ikaros_gallery' })
export class IkarosGallerySchemaClass {
  @Prop({ required: true }) title: string;
  @Prop() description?: string;
  @Prop({ required: true }) imageUrl: string;
  @Prop({ required: true }) authorId: string;
  @Prop({ required: true }) authorName: string;
  @Prop({ required: true, default: 'Draft' }) status: string;
  @Prop() rejectReason?: string;
  @Prop({ type: [GalleryRatingSchema], default: [] }) ratings: GalleryRatingSchema[];
  @Prop({ default: 0 }) averageRating: number;
  @Prop({ required: true, default: () => new Date() }) createdAtUtc: Date;
  @Prop({ required: true, default: () => new Date() }) updatedAtUtc: Date;
  @Prop() publishedAtUtc?: Date;
}

export const IkarosGallerySchema = SchemaFactory.createForClass(IkarosGallerySchemaClass);
IkarosGallerySchema.index({ authorId: 1 });
IkarosGallerySchema.index({ status: 1, createdAtUtc: -1 });
```

- [ ] **Step 4: Commit**

```bash
git add backend/src/modules/ikaros-gallery/interfaces/ backend/src/modules/ikaros-gallery/schemas/
git commit -m "feat(ikaros-gallery): interfaces a schema"
```

---

## Task 3: Repository implementace

**Files:**
- Create: `backend/src/modules/ikaros-gallery/repositories/ikaros-gallery.repository.ts`

- [ ] **Step 1: Napsat failing test**

```typescript
// backend/src/modules/ikaros-gallery/repositories/ikaros-gallery.repository.spec.ts
import { MongoIkarosGalleryRepository } from './ikaros-gallery.repository';

describe('MongoIkarosGalleryRepository', () => {
  const mockModel = {
    find: jest.fn().mockReturnValue({ sort: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }) }),
    findById: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(null) }),
    create: jest.fn(),
    findByIdAndUpdate: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(null) }),
    findByIdAndDelete: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(null) }),
    aggregate: jest.fn().mockResolvedValue([]),
  };

  it('findPublished volá find se status Published', async () => {
    const repo = new MongoIkarosGalleryRepository(mockModel as never);
    await repo.findPublished();
    expect(mockModel.find).toHaveBeenCalledWith({ status: 'Published' });
  });
});
```

- [ ] **Step 2: Spustit test, ověřit FAIL**

```bash
cd backend && npx jest ikaros-gallery.repository.spec --no-coverage
```
Očekáváno: FAIL.

- [ ] **Step 3: Implementovat repository**

```typescript
// backend/src/modules/ikaros-gallery/repositories/ikaros-gallery.repository.ts
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import type { IIkarosGalleryRepository } from '../interfaces/ikaros-gallery-repository.interface';
import type { IkarosGalleryItem, GalleryStatus, GalleryRating } from '../interfaces/ikaros-gallery.interface';
import { IkarosGallerySchemaClass, type IkarosGalleryDocument } from '../schemas/ikaros-gallery.schema';

@Injectable()
export class MongoIkarosGalleryRepository implements IIkarosGalleryRepository {
  constructor(
    @InjectModel(IkarosGallerySchemaClass.name)
    private readonly model: Model<IkarosGalleryDocument>,
  ) {}

  private toEntity(doc: IkarosGalleryDocument): IkarosGalleryItem {
    return {
      id: (doc._id as { toString(): string }).toString(),
      title: doc.title,
      description: doc.description,
      imageUrl: doc.imageUrl,
      authorId: doc.authorId,
      authorName: doc.authorName,
      status: doc.status as GalleryStatus,
      rejectReason: doc.rejectReason,
      ratings: (doc.ratings ?? []).map((r: { userId: string; stars: number }) => ({ userId: r.userId, stars: r.stars })),
      averageRating: doc.averageRating,
      createdAtUtc: doc.createdAtUtc,
      updatedAtUtc: doc.updatedAtUtc,
      publishedAtUtc: doc.publishedAtUtc,
    };
  }

  async findPublished(): Promise<IkarosGalleryItem[]> {
    const docs = await this.model.find({ status: 'Published' }).sort({ createdAtUtc: -1 }).lean<IkarosGalleryDocument[]>();
    return docs.map((d) => this.toEntity(d as unknown as IkarosGalleryDocument));
  }

  async findPublishedAndPending(): Promise<IkarosGalleryItem[]> {
    const docs = await this.model.find({ status: { $in: ['Published', 'Pending'] } }).sort({ createdAtUtc: -1 }).lean<IkarosGalleryDocument[]>();
    return docs.map((d) => this.toEntity(d as unknown as IkarosGalleryDocument));
  }

  async findPending(): Promise<IkarosGalleryItem[]> {
    const docs = await this.model.find({ status: 'Pending' }).sort({ createdAtUtc: -1 }).lean<IkarosGalleryDocument[]>();
    return docs.map((d) => this.toEntity(d as unknown as IkarosGalleryDocument));
  }

  async findByAuthor(authorId: string): Promise<IkarosGalleryItem[]> {
    const docs = await this.model.find({ authorId }).sort({ updatedAtUtc: -1 }).lean<IkarosGalleryDocument[]>();
    return docs.map((d) => this.toEntity(d as unknown as IkarosGalleryDocument));
  }

  async findById(id: string): Promise<IkarosGalleryItem | null> {
    const doc = await this.model.findById(id).lean<IkarosGalleryDocument>();
    return doc ? this.toEntity(doc as unknown as IkarosGalleryDocument) : null;
  }

  async create(data: Omit<IkarosGalleryItem, 'id'>): Promise<IkarosGalleryItem> {
    const doc = await this.model.create(data);
    return this.toEntity(doc);
  }

  async update(id: string, data: Partial<IkarosGalleryItem>): Promise<IkarosGalleryItem | null> {
    const doc = await this.model.findByIdAndUpdate(id, data, { new: true }).lean<IkarosGalleryDocument>();
    return doc ? this.toEntity(doc as unknown as IkarosGalleryDocument) : null;
  }

  async upsertRating(id: string, rating: GalleryRating): Promise<IkarosGalleryItem | null> {
    await this.model.findByIdAndUpdate(id, { $pull: { ratings: { userId: rating.userId } } });
    const doc = await this.model.findByIdAndUpdate(
      id,
      { $push: { ratings: rating } },
      { new: true },
    ).lean<IkarosGalleryDocument>();
    if (!doc) return null;
    const entity = this.toEntity(doc as unknown as IkarosGalleryDocument);
    const avg = entity.ratings.length > 0
      ? Math.round((entity.ratings.reduce((s, r) => s + r.stars, 0) / entity.ratings.length) * 10) / 10
      : 0;
    const updated = await this.model.findByIdAndUpdate(id, { averageRating: avg }, { new: true }).lean<IkarosGalleryDocument>();
    return updated ? this.toEntity(updated as unknown as IkarosGalleryDocument) : null;
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.model.findByIdAndDelete(id).lean();
    return result !== null;
  }

  async countByAuthorAndStatus(authorId: string): Promise<Record<GalleryStatus, number>> {
    const agg = await this.model.aggregate([
      { $match: { authorId } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]);
    const result: Record<GalleryStatus, number> = { Draft: 0, Pending: 0, Published: 0, Rejected: 0 };
    for (const item of agg) result[item._id as GalleryStatus] = item.count as number;
    return result;
  }
}
```

- [ ] **Step 4: Spustit test, ověřit PASS**

```bash
cd backend && npx jest ikaros-gallery.repository.spec --no-coverage
```
Očekáváno: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/ikaros-gallery/repositories/
git commit -m "feat(ikaros-gallery): repository implementace"
```

---

## Task 4: DTOs

**Files:**
- Create: `backend/src/modules/ikaros-gallery/dto/create-gallery-item.dto.ts`
- Create: `backend/src/modules/ikaros-gallery/dto/update-gallery-item.dto.ts`
- Create: `backend/src/modules/ikaros-gallery/dto/rate-gallery-item.dto.ts`
- Create: `backend/src/modules/ikaros-gallery/dto/reject-gallery-item.dto.ts`

- [ ] **Step 1: Vytvořit DTOs**

```typescript
// backend/src/modules/ikaros-gallery/dto/create-gallery-item.dto.ts
// Pozn.: Tento DTO se mapuje z multipart/form-data v controlleru — class-validator validuje textová pole.
import { IsString, IsNotEmpty, IsOptional, IsBoolean, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateGalleryItemDto {
  @IsString() @IsNotEmpty() @MaxLength(300)
  title: string;

  @IsString() @IsOptional() @MaxLength(2000)
  description?: string;

  @IsBoolean() @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  submit?: boolean;
}
```

```typescript
// backend/src/modules/ikaros-gallery/dto/update-gallery-item.dto.ts
import { IsString, IsOptional, MaxLength } from 'class-validator';

export class UpdateGalleryItemDto {
  @IsString() @IsOptional() @MaxLength(300)
  title?: string;

  @IsString() @IsOptional() @MaxLength(2000)
  description?: string;
}
```

```typescript
// backend/src/modules/ikaros-gallery/dto/rate-gallery-item.dto.ts
import { IsInt, Min, Max } from 'class-validator';

export class RateGalleryItemDto {
  @IsInt() @Min(1) @Max(5)
  stars: number;
}
```

```typescript
// backend/src/modules/ikaros-gallery/dto/reject-gallery-item.dto.ts
import { IsString, IsOptional, MaxLength } from 'class-validator';

export class RejectGalleryItemDto {
  @IsString() @IsOptional() @MaxLength(1000)
  reason?: string;
}
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/modules/ikaros-gallery/dto/
git commit -m "feat(ikaros-gallery): DTOs s validací"
```

---

## Task 5: Service + testy

**Files:**
- Create: `backend/src/modules/ikaros-gallery/ikaros-gallery.service.ts`
- Create: `backend/src/modules/ikaros-gallery/ikaros-gallery.service.spec.ts`

- [ ] **Step 1: Napsat failing testy**

```typescript
// backend/src/modules/ikaros-gallery/ikaros-gallery.service.spec.ts
import { Test } from '@nestjs/testing';
import { ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import { IkarosGalleryService } from './ikaros-gallery.service';
import { UserRole } from '../users/interfaces/user.interface';

const mockItem = {
  id: 'gal1',
  title: 'Obrázek',
  imageUrl: 'gallery/abc123',
  authorId: 'user1',
  authorName: 'Autor',
  status: 'Draft' as const,
  ratings: [],
  averageRating: 0,
  createdAtUtc: new Date(),
  updatedAtUtc: new Date(),
};

describe('IkarosGalleryService', () => {
  let service: IkarosGalleryService;
  const mockRepo = {
    findPublished: jest.fn(),
    findPublishedAndPending: jest.fn(),
    findPending: jest.fn(),
    findByAuthor: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    upsertRating: jest.fn(),
    delete: jest.fn(),
    countByAuthorAndStatus: jest.fn(),
  };
  const mockUsersRepo = { findByRoles: jest.fn(), findByUsername: jest.fn() };
  const mockMsgService = { create: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        IkarosGalleryService,
        { provide: 'IIkarosGalleryRepository', useValue: mockRepo },
        { provide: 'IUsersRepository', useValue: mockUsersRepo },
        { provide: 'IkarosMessagesService', useValue: mockMsgService },
      ],
    }).compile();
    service = module.get(IkarosGalleryService);
  });

  describe('isAdmin', () => {
    it('SpravceGalerie je admin', () => expect(service.isAdmin(UserRole.SpravceGalerie, 'nekdo')).toBe(true));
    it('SpravceClankuu je admin galerie (je v ADMIN_ROLES)', () => expect(service.isAdmin(UserRole.SpravceClankuu, 'nekdo')).toBe(true));
    it('Hráč není admin', () => expect(service.isAdmin(UserRole.Hrac, 'nekdo')).toBe(false));
    it('Tyky je admin', () => expect(service.isAdmin(UserRole.Hrac, 'Tyky')).toBe(true));
  });

  describe('approve', () => {
    it('Pending → Published, nastaví publishedAtUtc, notifikace autorovi', async () => {
      mockRepo.findById.mockResolvedValue({ ...mockItem, status: 'Pending' });
      mockRepo.update.mockResolvedValue({ ...mockItem, status: 'Published' });
      await service.approve('gal1', UserRole.Admin, 'admin');
      expect(mockRepo.update).toHaveBeenCalledWith('gal1', expect.objectContaining({ status: 'Published' }));
      expect(mockMsgService.create).toHaveBeenCalledWith(
        expect.objectContaining({ subject: 'Obrázek schválen', recipientId: 'user1' }),
        expect.anything(),
      );
    });

    it('hodí ForbiddenException pro Hráče', async () => {
      await expect(service.approve('gal1', UserRole.Hrac, 'nekdo')).rejects.toThrow(ForbiddenException);
    });
  });

  describe('delete', () => {
    it('autor smí smazat vlastní obrázek (jen DB, ne Cloudinary)', async () => {
      mockRepo.findById.mockResolvedValue(mockItem);
      mockRepo.delete.mockResolvedValue(true);
      await expect(service.delete('gal1', 'user1', UserRole.Hrac, 'autor')).resolves.toBeUndefined();
      expect(mockRepo.delete).toHaveBeenCalledWith('gal1');
    });
  });

  describe('rate', () => {
    it('hodí ForbiddenException pokud autor hodnotí vlastní obrázek', async () => {
      mockRepo.findById.mockResolvedValue({ ...mockItem, status: 'Published' });
      await expect(service.rate('gal1', 5, 'user1', UserRole.Hrac)).rejects.toThrow(ForbiddenException);
    });
  });
});
```

- [ ] **Step 2: Spustit test, ověřit FAIL**

```bash
cd backend && npx jest ikaros-gallery.service.spec --no-coverage
```
Očekáváno: FAIL.

- [ ] **Step 3: Implementovat service**

```typescript
// backend/src/modules/ikaros-gallery/ikaros-gallery.service.ts
import { Injectable, Inject, ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import type { IIkarosGalleryRepository } from './interfaces/ikaros-gallery-repository.interface';
import type { IkarosGalleryItem } from './interfaces/ikaros-gallery.interface';
import type { IUsersRepository } from '../users/interfaces/users-repository.interface';
import type { IkarosMessagesService } from '../ikaros-messages/ikaros-messages.service';
import { UserRole } from '../users/interfaces/user.interface';
import type { UpdateGalleryItemDto } from './dto/update-gallery-item.dto';

const ADMIN_ROLES = [UserRole.Superadmin, UserRole.Admin, UserRole.PJ, UserRole.SpravceClankuu, UserRole.SpravceGalerie];
const SYSTEM_SENDER = { id: 'system', username: 'Systém' };

@Injectable()
export class IkarosGalleryService {
  constructor(
    @Inject('IIkarosGalleryRepository') private readonly repo: IIkarosGalleryRepository,
    @Inject('IUsersRepository') private readonly usersRepo: IUsersRepository,
    @Inject('IkarosMessagesService') private readonly msgService: IkarosMessagesService,
  ) {}

  isAdmin(role: UserRole, username: string): boolean {
    return ADMIN_ROLES.includes(role) || username === 'Tyky';
  }

  private assertAdmin(role: UserRole, username: string): void {
    if (!this.isAdmin(role, username)) throw new ForbiddenException('Nedostatečná oprávnění');
  }

  private async notifyAdmins(subject: string, body: string): Promise<void> {
    const admins = await this.usersRepo.findByRoles(ADMIN_ROLES);
    const tyky = await this.usersRepo.findByUsername('Tyky');
    const recipients = [...admins];
    if (tyky && !admins.some((a) => a.id === tyky.id)) recipients.push(tyky);
    await Promise.all(
      recipients.map((r) =>
        this.msgService.create({ recipientId: r.id, recipientName: r.username, subject, body }, SYSTEM_SENDER),
      ),
    );
  }

  private async notifyUser(recipientId: string, recipientName: string, subject: string, body: string): Promise<void> {
    await this.msgService.create({ recipientId, recipientName, subject, body }, SYSTEM_SENDER);
  }

  async findAll(role: UserRole, username: string): Promise<IkarosGalleryItem[]> {
    if (this.isAdmin(role, username)) return this.repo.findPublishedAndPending();
    return this.repo.findPublished();
  }

  async findMy(authorId: string): Promise<IkarosGalleryItem[]> {
    return this.repo.findByAuthor(authorId);
  }

  async findPending(role: UserRole, username: string): Promise<IkarosGalleryItem[]> {
    this.assertAdmin(role, username);
    return this.repo.findPending();
  }

  async findStats(authorId: string): Promise<{ draft: number; pending: number; published: number; rejected: number; totalRatings: number; averageRating: number }> {
    const [counts, items] = await Promise.all([
      this.repo.countByAuthorAndStatus(authorId),
      this.repo.findByAuthor(authorId),
    ]);
    const published = items.filter((i) => i.status === 'Published');
    const totalRatings = published.reduce((s, i) => s + i.ratings.length, 0);
    const avgSum = published.reduce((s, i) => s + i.averageRating * i.ratings.length, 0);
    const averageRating = totalRatings > 0 ? Math.round((avgSum / totalRatings) * 10) / 10 : 0;
    return { draft: counts.Draft, pending: counts.Pending, published: counts.Published, rejected: counts.Rejected, totalRatings, averageRating };
  }

  async findById(id: string, userId: string, role: UserRole, username: string): Promise<IkarosGalleryItem> {
    const item = await this.repo.findById(id);
    if (!item) throw new NotFoundException('Obrázek nenalezen');
    if (item.status !== 'Published' && item.authorId !== userId && !this.isAdmin(role, username)) {
      throw new ForbiddenException('Přístup odepřen');
    }
    return item;
  }

  async create(imageUrl: string, title: string, description: string | undefined, submit: boolean, authorId: string, authorName: string): Promise<IkarosGalleryItem> {
    const status = submit ? 'Pending' : 'Draft';
    const item = await this.repo.create({
      title, description, imageUrl, authorId, authorName, status,
      ratings: [], averageRating: 0, createdAtUtc: new Date(), updatedAtUtc: new Date(),
    });
    if (status === 'Pending') {
      await this.notifyAdmins('Obrázek ke schválení', `/ikaros/galerie/${item.id}`);
    }
    return item;
  }

  async update(id: string, dto: UpdateGalleryItemDto, userId: string, role: UserRole, username: string): Promise<IkarosGalleryItem> {
    const item = await this.repo.findById(id);
    if (!item) throw new NotFoundException('Obrázek nenalezen');
    if (item.authorId !== userId) throw new ForbiddenException('Přístup odepřen');
    if (item.status !== 'Draft' && item.status !== 'Rejected') {
      throw new BadRequestException('Editovat lze jen Draft nebo Rejected obrázek');
    }
    const updated = await this.repo.update(id, { ...dto, updatedAtUtc: new Date() });
    return updated!;
  }

  async delete(id: string, userId: string, role: UserRole, username: string): Promise<void> {
    const item = await this.repo.findById(id);
    if (!item) throw new NotFoundException('Obrázek nenalezen');
    if (item.authorId !== userId && !this.isAdmin(role, username)) {
      throw new ForbiddenException('Přístup odepřen');
    }
    await this.repo.delete(id);
  }

  async submit(id: string, userId: string, role: UserRole): Promise<IkarosGalleryItem> {
    const item = await this.repo.findById(id);
    if (!item) throw new NotFoundException('Obrázek nenalezen');
    if (item.authorId !== userId) throw new ForbiddenException('Přístup odepřen');
    if (item.status !== 'Draft' && item.status !== 'Rejected') {
      throw new BadRequestException('Odeslat lze jen Draft nebo Rejected obrázek');
    }
    const updated = await this.repo.update(id, { status: 'Pending', updatedAtUtc: new Date() });
    await this.notifyAdmins('Obrázek ke schválení', `/ikaros/galerie/${id}`);
    return updated!;
  }

  async approve(id: string, role: UserRole, username: string): Promise<IkarosGalleryItem> {
    this.assertAdmin(role, username);
    const item = await this.repo.findById(id);
    if (!item) throw new NotFoundException('Obrázek nenalezen');
    if (item.status !== 'Pending') throw new BadRequestException('Schválit lze jen Pending obrázek');
    const updated = await this.repo.update(id, { status: 'Published', publishedAtUtc: new Date(), updatedAtUtc: new Date() });
    await this.notifyUser(item.authorId, item.authorName, 'Obrázek schválen', `Tvůj obrázek "${item.title}" byl schválen.`);
    return updated!;
  }

  async reject(id: string, reason: string | undefined, role: UserRole, username: string): Promise<IkarosGalleryItem> {
    this.assertAdmin(role, username);
    const item = await this.repo.findById(id);
    if (!item) throw new NotFoundException('Obrázek nenalezen');
    if (item.status !== 'Pending') throw new BadRequestException('Zamítnout lze jen Pending obrázek');
    const updated = await this.repo.update(id, { status: 'Rejected', rejectReason: reason, updatedAtUtc: new Date() });
    const body = reason ? `Důvod zamítnutí: ${reason}` : `Tvůj obrázek "${item.title}" byl zamítnut.`;
    await this.notifyUser(item.authorId, item.authorName, 'Obrázek zamítnut', body);
    return updated!;
  }

  async rate(id: string, stars: number, userId: string, role: UserRole): Promise<{ averageRating: number; totalRatings: number }> {
    const item = await this.repo.findById(id);
    if (!item) throw new NotFoundException('Obrázek nenalezen');
    if (item.status !== 'Published') throw new BadRequestException('Hodnotit lze jen Published obrázek');
    if (item.authorId === userId) throw new ForbiddenException('Autor nemůže hodnotit vlastní obrázek');
    const updated = await this.repo.upsertRating(id, { userId, stars });
    return { averageRating: updated?.averageRating ?? 0, totalRatings: updated?.ratings.length ?? 0 };
  }
}
```

- [ ] **Step 4: Spustit testy, ověřit PASS**

```bash
cd backend && npx jest ikaros-gallery.service.spec --no-coverage
```
Očekáváno: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/ikaros-gallery/ikaros-gallery.service.ts backend/src/modules/ikaros-gallery/ikaros-gallery.service.spec.ts
git commit -m "feat(ikaros-gallery): service s workflow, notifikacemi + testy"
```

---

## Task 6: Controller + Module

**Files:**
- Create: `backend/src/modules/ikaros-gallery/ikaros-gallery.controller.ts`
- Create: `backend/src/modules/ikaros-gallery/ikaros-gallery.module.ts`

- [ ] **Step 1: Vytvořit controller**

```typescript
// backend/src/modules/ikaros-gallery/ikaros-gallery.controller.ts
import {
  Controller, Get, Post, Put, Delete,
  Param, Body, UseGuards, HttpCode,
  UseInterceptors, UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { IkarosGalleryService } from './ikaros-gallery.service';
import { UploadService } from '../upload/upload.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CreateGalleryItemDto } from './dto/create-gallery-item.dto';
import { UpdateGalleryItemDto } from './dto/update-gallery-item.dto';
import { RateGalleryItemDto } from './dto/rate-gallery-item.dto';
import { RejectGalleryItemDto } from './dto/reject-gallery-item.dto';
import { UserRole } from '../users/interfaces/user.interface';

interface RequestUser { id: string; username: string; role: UserRole }

@Controller('ikaros-gallery')
@UseGuards(JwtAuthGuard)
export class IkarosGalleryController {
  constructor(
    private readonly service: IkarosGalleryService,
    private readonly uploadService: UploadService,
  ) {}

  @Get()
  findAll(@CurrentUser() user: RequestUser) {
    return this.service.findAll(user.role, user.username);
  }

  @Get('my')
  findMy(@CurrentUser() user: RequestUser) {
    return this.service.findMy(user.id);
  }

  @Get('pending')
  findPending(@CurrentUser() user: RequestUser) {
    return this.service.findPending(user.role, user.username);
  }

  @Get('stats')
  findStats(@CurrentUser() user: RequestUser) {
    return this.service.findStats(user.id);
  }

  @Get(':id')
  findById(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.service.findById(id, user.id, user.role, user.username);
  }

  @Post()
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 50 * 1024 * 1024 } }))
  async create(
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: CreateGalleryItemDto,
    @CurrentUser() user: RequestUser,
  ) {
    const { publicId } = await this.uploadService.uploadGalleryImage(file);
    return this.service.create(publicId, dto.title, dto.description, dto.submit ?? false, user.id, user.username);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpdateGalleryItemDto, @CurrentUser() user: RequestUser) {
    return this.service.update(id, dto, user.id, user.role, user.username);
  }

  @Delete(':id')
  @HttpCode(204)
  async delete(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    await this.service.delete(id, user.id, user.role, user.username);
  }

  @Post(':id/submit')
  submit(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.service.submit(id, user.id, user.role);
  }

  @Post(':id/approve')
  approve(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.service.approve(id, user.role, user.username);
  }

  @Post(':id/reject')
  reject(@Param('id') id: string, @Body() dto: RejectGalleryItemDto, @CurrentUser() user: RequestUser) {
    return this.service.reject(id, dto.reason, user.role, user.username);
  }

  @Post(':id/rate')
  rate(@Param('id') id: string, @Body() dto: RateGalleryItemDto, @CurrentUser() user: RequestUser) {
    return this.service.rate(id, dto.stars, user.id, user.role);
  }
}
```

- [ ] **Step 2: Vytvořit modul**

```typescript
// backend/src/modules/ikaros-gallery/ikaros-gallery.module.ts
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { IkarosGallerySchemaClass, IkarosGallerySchema } from './schemas/ikaros-gallery.schema';
import { MongoIkarosGalleryRepository } from './repositories/ikaros-gallery.repository';
import { IkarosGalleryService } from './ikaros-gallery.service';
import { IkarosGalleryController } from './ikaros-gallery.controller';
import { IkarosMessagesModule } from '../ikaros-messages/ikaros-messages.module';
import { UploadModule } from '../upload/upload.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: IkarosGallerySchemaClass.name, schema: IkarosGallerySchema },
    ]),
    IkarosMessagesModule,
    UploadModule,
  ],
  controllers: [IkarosGalleryController],
  providers: [
    IkarosGalleryService,
    { provide: 'IIkarosGalleryRepository', useClass: MongoIkarosGalleryRepository },
    { provide: 'IkarosMessagesService', useExisting: 'IkarosMessagesService' },
  ],
})
export class IkarosGalleryModule {}
```

- [ ] **Step 3: Commit**

```bash
git add backend/src/modules/ikaros-gallery/ikaros-gallery.controller.ts backend/src/modules/ikaros-gallery/ikaros-gallery.module.ts
git commit -m "feat(ikaros-gallery): controller a modul"
```

---

## Task 7: Registrace + roadmapa

**Files:**
- Modify: `backend/src/app.module.ts`
- Modify: `docs/roadmap.md`

- [ ] **Step 1: Přidat `IkarosGalleryModule` do app.module.ts**

V `backend/src/app.module.ts` přidej:
```typescript
import { IkarosGalleryModule } from './modules/ikaros-gallery/ikaros-gallery.module';
```
A do pole `imports` přidej `IkarosGalleryModule`.

- [ ] **Step 2: Build check**

```bash
cd backend && npx tsc --noEmit
```
Očekáváno: žádné chyby.

- [ ] **Step 3: Spustit všechny testy**

```bash
cd backend && npx jest --no-coverage
```
Očekáváno: PASS.

- [ ] **Step 4: Aktualizovat roadmapu**

V `docs/roadmap.md` v sekci `## Krok 11c — IkarosGallery ⬜`:
- Změň `⬜` na `✅`, zaškrtni checkboxy
- Doplň: `**Plán:** [docs/superpowers/plans/2026-05-04-krok-11c-ikaros-gallery.md](superpowers/plans/2026-05-04-krok-11c-ikaros-gallery.md)`

V tabulce změň `| 11c | IkarosGallery | ⬜ |` na `| 11c | IkarosGallery | ✅ |`.

- [ ] **Step 5: Commit**

```bash
git add backend/src/app.module.ts docs/roadmap.md
git commit -m "feat(ikaros-gallery): registrace modulu, roadmapa aktualizována"
```
