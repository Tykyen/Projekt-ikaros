import type { NpcTemplate } from './npc-template.interface';

export interface INpcTemplatesRepository {
  findByWorld(worldId: string): Promise<NpcTemplate[]>;
  findGlobal(): Promise<NpcTemplate[]>;
  findById(id: string): Promise<NpcTemplate | null>;
  create(data: Partial<NpcTemplate>): Promise<NpcTemplate>;
  updateByIdAndWorld(id: string, worldId: string, data: Partial<NpcTemplate>): Promise<NpcTemplate | null>;
  deleteByIdAndWorld(id: string, worldId: string): Promise<boolean>;
}
