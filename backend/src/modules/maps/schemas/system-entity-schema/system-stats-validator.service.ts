/**
 * 10.2d-prep-A C11 — BE SystemStatsValidator service.
 *
 * Autoritativní validator pro `systemStats` payloady v MapToken (token.add,
 * token.update ops). Mirror FE validateSystemStats (C9), ale autoritativní.
 *
 * `validateForCreate`: required + default fill + type check + min/max.
 * `validateForPatch`: strict mode (unknown keys reject) + partial type check.
 *
 * Plán: docs/arch/phase-10/plan-10.2d-prep-A.md C11.
 */
import { Injectable } from '@nestjs/common';
import { SchemaRegistryService } from './schema-registry.service';
import type {
  SchemaField,
  SystemEntitySchema,
  SystemEntityType,
  ValidationResult,
} from './system-entity-schema.types';

@Injectable()
export class SystemStatsValidatorService {
  constructor(private readonly registry: SchemaRegistryService) {}

  validateForCreate(
    stats: Record<string, unknown>,
    systemId: string,
    entityType: SystemEntityType,
  ): ValidationResult {
    const schema = this.registry.get(systemId, entityType);
    if (!schema) {
      return {
        valid: false,
        errors: { _schema: `No schema for ${systemId}:${entityType}` },
        filled: stats,
      };
    }
    return this.validateForCreateWithSchema(stats, schema);
  }

  validateForPatch(
    patch: Record<string, unknown>,
    systemId: string,
    entityType: SystemEntityType,
  ): ValidationResult {
    const schema = this.registry.get(systemId, entityType);
    if (!schema) {
      return {
        valid: false,
        errors: { _schema: `No schema for ${systemId}:${entityType}` },
        filled: patch,
      };
    }
    return this.validateForPatchWithSchema(patch, schema);
  }

  /**
   * 16.2g F2 — validace proti PŘEDANÉMU schématu (world-scoped, z DB), ne z
   * globálního registry. Pro „Vlastní Systém" bestie s per-svět schématem.
   */
  validateForCreateWithSchema(
    stats: Record<string, unknown>,
    schema: SystemEntitySchema,
  ): ValidationResult {
    const errors: Record<string, string> = {};
    const filled: Record<string, unknown> = { ...stats };

    for (const section of schema.sections) {
      for (const field of section.fields) {
        this.validateField(field, filled, errors, true);
      }
    }

    return {
      valid: Object.keys(errors).length === 0,
      errors,
      filled,
    };
  }

  validateForPatchWithSchema(
    patch: Record<string, unknown>,
    schema: SystemEntitySchema,
  ): ValidationResult {
    const errors: Record<string, string> = {};
    const knownKeys = new Set<string>();
    for (const section of schema.sections) {
      for (const field of section.fields) knownKeys.add(field.key);
    }

    // Strict: unknown keys reject.
    for (const key of Object.keys(patch)) {
      if (!knownKeys.has(key)) {
        errors[key] = `Unknown field: ${key}`;
      }
    }

    for (const section of schema.sections) {
      for (const field of section.fields) {
        if (field.key in patch) {
          this.validateField(field, patch, errors, false);
        }
      }
    }

    return {
      valid: Object.keys(errors).length === 0,
      errors,
      filled: patch,
    };
  }

  private validateField(
    field: SchemaField,
    state: Record<string, unknown>,
    errors: Record<string, string>,
    isCreate: boolean,
  ): void {
    let value = state[field.key];

    if (isCreate && value === undefined && field.default !== undefined) {
      state[field.key] = field.default;
      value = field.default;
    }

    if (
      field.required &&
      (value === undefined || value === null || value === '')
    ) {
      errors[field.key] = `${field.label} is required`;
      return;
    }

    if (field.type === 'computed') return;
    if (value === undefined || value === null) return;

    switch (field.type) {
      case 'number': {
        const num = typeof value === 'number' ? value : Number(value);
        if (Number.isNaN(num)) {
          errors[field.key] = `${field.label} must be number`;
          return;
        }
        if (field.min !== undefined && num < field.min) {
          errors[field.key] = `${field.label}: minimum ${field.min}`;
        }
        if (field.max !== undefined && num > field.max) {
          errors[field.key] = `${field.label}: maximum ${field.max}`;
        }
        state[field.key] = num;
        break;
      }
      case 'string':
        if (typeof value !== 'string')
          errors[field.key] = `${field.label} must be string`;
        break;
      case 'boolean':
        if (typeof value !== 'boolean')
          errors[field.key] = `${field.label} must be boolean`;
        break;
      case 'enum':
        if (typeof value !== 'string' || !field.enumValues?.includes(value)) {
          errors[field.key] = `${field.label}: invalid enum value`;
        }
        break;
      case 'list':
        if (!Array.isArray(value))
          errors[field.key] = `${field.label} must be array`;
        break;
    }
  }
}
