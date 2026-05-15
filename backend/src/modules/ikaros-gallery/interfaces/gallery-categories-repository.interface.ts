import type { GalleryCategory } from './gallery-category.interface';

export interface IGalleryCategoriesRepository {
  findAll(): Promise<GalleryCategory[]>;
  findByKey(key: string): Promise<GalleryCategory | null>;
  create(data: Omit<GalleryCategory, 'createdAtUtc'>): Promise<GalleryCategory>;
  update(
    key: string,
    patch: Partial<Omit<GalleryCategory, 'key' | 'createdAtUtc'>>,
  ): Promise<GalleryCategory | null>;
  delete(key: string): Promise<boolean>;
}
