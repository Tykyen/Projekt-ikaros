import {
  Injectable,
  Inject,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import type { IGalleryCategoriesRepository } from './interfaces/gallery-categories-repository.interface';
import type { GalleryCategory } from './interfaces/gallery-category.interface';
import type { IIkarosGalleryRepository } from './interfaces/ikaros-gallery-repository.interface';
import type { CreateGalleryCategoryDto } from './dto/create-gallery-category.dto';
import type { UpdateGalleryCategoryDto } from './dto/update-gallery-category.dto';

/**
 * Spec 3.3a — kategorie obrázků galerie. Zrcadlí `IkarosCategoriesService`
 * (article-categories). `delete` blokuje smazání kategorie, kterou používají
 * obrázky.
 */
@Injectable()
export class GalleryCategoriesService {
  constructor(
    @Inject('IGalleryCategoriesRepository')
    private readonly repo: IGalleryCategoriesRepository,
    @Inject('IIkarosGalleryRepository')
    private readonly galleryRepo: IIkarosGalleryRepository,
  ) {}

  async findAll(): Promise<GalleryCategory[]> {
    return this.repo.findAll();
  }

  async findByKey(key: string): Promise<GalleryCategory> {
    const cat = await this.repo.findByKey(key);
    if (!cat) {
      throw new NotFoundException({
        code: 'GALLERY_CATEGORY_NOT_FOUND',
        message: `Kategorie '${key}' nenalezena`,
      });
    }
    return cat;
  }

  /** Lightweight existence check bez výjimky — pro validaci v gallery service. */
  async existsByKey(key: string): Promise<boolean> {
    return (await this.repo.findByKey(key)) !== null;
  }

  async create(dto: CreateGalleryCategoryDto): Promise<GalleryCategory> {
    const existing = await this.repo.findByKey(dto.key);
    if (existing) {
      throw new ConflictException({
        code: 'GALLERY_CATEGORY_KEY_TAKEN',
        message: `Kategorie s klíčem '${dto.key}' už existuje`,
      });
    }
    return this.repo.create(dto);
  }

  async update(
    key: string,
    dto: UpdateGalleryCategoryDto,
  ): Promise<GalleryCategory> {
    await this.findByKey(key); // throws if not found
    const updated = await this.repo.update(key, dto);
    if (!updated) {
      throw new NotFoundException({
        code: 'GALLERY_CATEGORY_NOT_FOUND',
        message: `Kategorie '${key}' nenalezena`,
      });
    }
    return updated;
  }

  async delete(key: string): Promise<void> {
    await this.findByKey(key);
    const inUse = await this.galleryRepo.countByCategory(key);
    if (inUse > 0) {
      throw new ConflictException({
        code: 'GALLERY_CATEGORY_IN_USE',
        message: `Kategorii '${key}' nelze smazat — používá ji ${inUse} obrázků`,
      });
    }
    await this.repo.delete(key);
  }
}
