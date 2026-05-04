import type { IkarosNewsItem } from './ikaros-news.interface';

export interface IIkarosNewsRepository {
  findActive(): Promise<IkarosNewsItem[]>;
  create(data: Omit<IkarosNewsItem, 'id'>): Promise<IkarosNewsItem>;
  delete(id: string): Promise<boolean>;
}
