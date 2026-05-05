import type { MapTemplate } from './map-template.interface';

export interface IMapTemplatesRepository {
  findAll(): Promise<MapTemplate[]>;
  findById(id: string): Promise<MapTemplate | null>;
  create(data: Partial<MapTemplate>): Promise<MapTemplate>;
  replace(id: string, data: Partial<MapTemplate>): Promise<MapTemplate | null>;
  delete(id: string): Promise<boolean>;
}
