/**
 * 10.2d-prep-A C10 — BE schema registry service.
 *
 * Loaduje JSON schémata z `backend/assets/schemas/` při startup
 * (`onModuleInit`). FE exportuje JSON přes `npm run export-schemas` z
 * canonical TS/JSON files.
 *
 * Spec: docs/arch/phase-10/spec-10.2d-prep-A.md §3.1, §3.6.
 * Plán: docs/arch/phase-10/plan-10.2d-prep-A.md C10.
 */
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import type {
  SystemEntitySchema,
  SystemEntityType,
} from './system-entity-schema.types';

@Injectable()
export class SchemaRegistryService implements OnModuleInit {
  private readonly logger = new Logger(SchemaRegistryService.name);
  private readonly map = new Map<string, SystemEntitySchema>();

  onModuleInit(): void {
    // Path: backend/dist/modules/maps/schemas/system-entity-schema/*.js
    // → backend/assets/schemas/. Z dist je to 5 levels up + assets/schemas.
    // Z src při ts-node analogicky. Použijeme process.cwd() + assets/schemas.
    const dir = path.resolve(process.cwd(), 'assets', 'schemas');
    if (!fs.existsSync(dir)) {
      this.logger.warn(
        `[schema-registry] No schemas dir at ${dir}. Run \`npm run export-schemas\` in FE.`,
      );
      return;
    }
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
    let count = 0;
    for (const file of files) {
      const content = fs.readFileSync(path.join(dir, file), 'utf-8');
      let parsed: SystemEntitySchema;
      try {
        parsed = JSON.parse(content) as SystemEntitySchema;
      } catch (e) {
        this.logger.error(`[schema-registry] FAIL parse ${file}: ${String(e)}`);
        continue;
      }
      if (!parsed.systemId || !parsed.entityType) {
        this.logger.error(
          `[schema-registry] FAIL ${file}: missing systemId/entityType`,
        );
        continue;
      }
      const key = `${parsed.systemId}:${parsed.entityType}`;
      this.map.set(key, parsed);
      count++;
    }
    this.logger.log(`[schema-registry] Loaded ${count} schémat z ${dir}`);
  }

  get(
    systemId: string,
    entityType: SystemEntityType,
  ): SystemEntitySchema | null {
    return this.map.get(`${systemId}:${entityType}`) ?? null;
  }

  list(systemId: string): SystemEntitySchema[] {
    const result: SystemEntitySchema[] = [];
    for (const schema of this.map.values()) {
      if (schema.systemId === systemId) result.push(schema);
    }
    return result;
  }

  listSystems(): string[] {
    const systems = new Set<string>();
    for (const schema of this.map.values()) systems.add(schema.systemId);
    return Array.from(systems).sort();
  }
}
