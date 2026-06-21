import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type WorldElevationDocument =
  HydratedDocument<WorldElevationSchemaClass>;

/**
 * Elevation („nahození práv") — platform Admin/Superadmin si per-svět vědomě
 * aktivuje mocnou roli. Bez záznamu = de-elevated (žádný world bypass).
 * Spec: docs/arch/phase-1/_side-tasks/spec-world-admin-elevation.md.
 *
 * Perzistentní toggle bez TTL (D-3) — trvá do explicitního vypnutí nebo odhlášení.
 */
@Schema({ collection: 'world_elevations' })
export class WorldElevationSchemaClass {
  @Prop({ required: true, index: true }) userId: string;
  @Prop({ required: true, index: true }) worldId: string;
  @Prop({ type: Date, default: () => new Date() }) activatedAt: Date;
}

export const WorldElevationSchema = SchemaFactory.createForClass(
  WorldElevationSchemaClass,
);

// Jeden záznam na (uživatel, svět) — idempotentní zapnutí.
WorldElevationSchema.index({ userId: 1, worldId: 1 }, { unique: true });
