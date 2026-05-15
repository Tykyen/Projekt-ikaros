import {
  Injectable,
  Inject,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import type { IArticleCategoriesRepository } from './interfaces/article-categories-repository.interface';
import type { ArticleCategory } from './interfaces/article-category.interface';
import type { IIkarosArticlesRepository } from '../ikaros-articles/interfaces/ikaros-articles-repository.interface';
import type { CreateArticleCategoryDto } from './dto/create-article-category.dto';
import type { UpdateArticleCategoryDto } from './dto/update-article-category.dto';

@Injectable()
export class IkarosCategoriesService {
  constructor(
    @Inject('IArticleCategoriesRepository')
    private readonly repo: IArticleCategoriesRepository,
    @Inject('IIkarosArticlesRepository')
    private readonly articlesRepo: IIkarosArticlesRepository,
  ) {}

  async findAll(): Promise<ArticleCategory[]> {
    return this.repo.findAll();
  }

  async findByKey(key: string): Promise<ArticleCategory> {
    const cat = await this.repo.findByKey(key);
    if (!cat) {
      throw new NotFoundException({
        code: 'CATEGORY_NOT_FOUND',
        message: `Kategorie '${key}' nenalezena`,
      });
    }
    return cat;
  }

  /** Lightweight existence check without throwing — pro validaci v jiných službách. */
  async existsByKey(key: string): Promise<boolean> {
    return (await this.repo.findByKey(key)) !== null;
  }

  async create(dto: CreateArticleCategoryDto): Promise<ArticleCategory> {
    const existing = await this.repo.findByKey(dto.key);
    if (existing) {
      throw new ConflictException({
        code: 'CATEGORY_KEY_TAKEN',
        message: `Kategorie s klíčem '${dto.key}' už existuje`,
      });
    }
    return this.repo.create(dto);
  }

  async update(
    key: string,
    dto: UpdateArticleCategoryDto,
  ): Promise<ArticleCategory> {
    await this.findByKey(key); // throws if not found
    const updated = await this.repo.update(key, dto);
    if (!updated) {
      throw new NotFoundException({
        code: 'CATEGORY_NOT_FOUND',
        message: `Kategorie '${key}' nenalezena`,
      });
    }
    return updated;
  }

  async delete(key: string): Promise<void> {
    await this.findByKey(key);
    const inUse = await this.articlesRepo.countByCategory(key);
    if (inUse > 0) {
      throw new ConflictException({
        code: 'CATEGORY_IN_USE',
        message: `Kategorii '${key}' nelze smazat — používá ji ${inUse} článků`,
      });
    }
    await this.repo.delete(key);
  }
}
