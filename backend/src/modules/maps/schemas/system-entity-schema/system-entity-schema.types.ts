/**
 * 10.2d-prep-A C10 — BE mirror FE schema types.
 *
 * Strukturálně identické s FE
 * `Projekt-ikaros-FE/src/features/world/tactical-map/schemas/types.ts`.
 * BE čte stejné JSON files z `backend/assets/schemas/` (exportované přes
 * FE `npm run export-schemas`).
 *
 * Spec: docs/arch/phase-10/spec-10.2d-prep-A.md §4.
 * Plán: docs/arch/phase-10/plan-10.2d-prep-A.md C10.
 */

export type SystemEntityType =
  | 'bestie'
  | 'token'
  | 'character-pc'
  | 'character-npc'
  | 'diary-pc'
  | 'diary-npc';

export type SchemaFieldType =
  | 'number'
  | 'string'
  | 'enum'
  | 'list'
  | 'boolean'
  | 'computed';

export type CombatBehavior =
  | 'damageable'
  | 'armor-reducer'
  | 'initiative'
  | 'movement'
  | 'roll-target'
  | 'static';

export interface SchemaField {
  key: string;
  label: string;
  type: SchemaFieldType;
  default?: unknown;
  min?: number;
  max?: number;
  required?: boolean;
  enumValues?: string[];
  formula?: string;
  combatBehavior?: CombatBehavior;
  description?: string;
  listItemFields?: SchemaField[];
}

export interface SchemaSection {
  key: string;
  label: string;
  fields: SchemaField[];
  collapsible?: boolean;
  initiallyCollapsed?: boolean;
}

export interface SystemEntitySchema {
  systemId: string;
  entityType: SystemEntityType;
  version: number;
  sections: SchemaSection[];
}

export interface ValidationResult {
  valid: boolean;
  errors: Record<string, string>;
  filled: Record<string, unknown>;
}
