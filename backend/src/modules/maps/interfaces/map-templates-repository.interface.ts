import type { MapTemplate } from './map-template.interface';

export interface IMapTemplatesRepository {
  findAll(): Promise<MapTemplate[]>;
  /**
   * 10.2c-edit-2 — per-PJ filter pro non-Admin volajícího. Sort
   * `updatedAt desc` (nejnovější nahoře v UI knihovny).
   */
  findByOwner(ownerId: string): Promise<MapTemplate[]>;
  findById(id: string): Promise<MapTemplate | null>;
  create(data: Partial<MapTemplate>): Promise<MapTemplate>;
  replace(id: string, data: Partial<MapTemplate>): Promise<MapTemplate | null>;
  delete(id: string): Promise<boolean>;
}
