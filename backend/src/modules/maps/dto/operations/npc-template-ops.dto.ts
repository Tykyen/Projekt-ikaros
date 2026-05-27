import {
  Equals,
  IsString,
  IsNotEmpty,
  IsObject,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * 10.2-prep-1 — NPC template operations DTOs.
 * Spec: docs/arch/maps/operations/data-models.md § NPC template operace.
 */

/** Holder pro `template` payload. Hluboká validace odložená. */
export class NpcTemplatePayloadDto {
  @IsString() @IsNotEmpty() id!: string;
  @IsString() name!: string;
  [key: string]: unknown;
}

export class NpcTemplateAddOpDto {
  @Equals('npcTemplate.add') type!: 'npcTemplate.add';
  @IsObject()
  @ValidateNested()
  @Type(() => NpcTemplatePayloadDto)
  template!: NpcTemplatePayloadDto;
}

export class NpcTemplateRemoveOpDto {
  @Equals('npcTemplate.remove') type!: 'npcTemplate.remove';
  @IsString() @IsNotEmpty() templateId!: string;
}

export class NpcTemplateUpdateOpDto {
  @Equals('npcTemplate.update') type!: 'npcTemplate.update';
  @IsString() @IsNotEmpty() templateId!: string;
  @IsObject() patch!: Record<string, unknown>;
}
