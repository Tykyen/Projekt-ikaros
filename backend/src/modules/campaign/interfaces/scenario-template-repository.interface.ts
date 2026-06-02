import type { ScenarioTemplate } from './scenario-template.interface';

export interface IScenarioTemplateRepository {
  findAll(): Promise<ScenarioTemplate[]>;
  /** Per-PJ filter; sort `updatedAt desc` (nejnovější nahoře). */
  findByOwner(ownerId: string): Promise<ScenarioTemplate[]>;
  findById(id: string): Promise<ScenarioTemplate | null>;
  create(data: Partial<ScenarioTemplate>): Promise<ScenarioTemplate>;
  delete(id: string): Promise<boolean>;
}
