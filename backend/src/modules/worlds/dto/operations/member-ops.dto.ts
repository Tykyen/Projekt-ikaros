import {
  Equals,
  IsString,
  IsNotEmpty,
  IsArray,
  ArrayMinSize,
  ArrayMaxSize,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * 10.2-prep-1 — member assignment operations DTOs (cross-scene).
 * Spec: docs/arch/maps/operations/data-models.md § Member assignment.
 */

export class MemberAssignToSceneOpDto {
  @Equals('member.assignToScene') type!: 'member.assignToScene';
  @IsString() @IsNotEmpty() userId!: string;
  @IsString() @IsNotEmpty() sceneId!: string;
}

export class MemberUnassignOpDto {
  @Equals('member.unassign') type!: 'member.unassign';
  @IsString() @IsNotEmpty() userId!: string;
}

export class MemberBulkAssignToSceneOpDto {
  @Equals('member.bulkAssignToScene') type!: 'member.bulkAssignToScene';
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @IsString({ each: true })
  userIds!: string[];
  @IsString() @IsNotEmpty() sceneId!: string;
}

/**
 * D-NEW-INV-MAPS — jedna položka per-member přiřazení pro bulk restore.
 * `sceneId: null` = unassign (member byl před bulk operací bez scény).
 */
export class MemberAssignmentEntryDto {
  @IsString() @IsNotEmpty() userId!: string;
  @ValidateIf((_o, value) => value !== null)
  @IsString()
  @IsNotEmpty()
  sceneId!: string | null;
}

/**
 * D-NEW-INV-MAPS — inverse pro `member.bulkAssignToScene`: obnoví PŮVODNÍ
 * per-member přiřazení (každý member může mít jinou cílovou scénu / null).
 * PJ-only (authorizer: hráč projde jen self `member.unassign`).
 */
export class MemberBulkRestoreAssignmentsOpDto {
  @Equals('member.bulkRestoreAssignments')
  type!: 'member.bulkRestoreAssignments';
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => MemberAssignmentEntryDto)
  assignments!: MemberAssignmentEntryDto[];
}
