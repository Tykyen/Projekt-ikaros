import {
  Equals,
  IsString,
  IsNotEmpty,
  IsArray,
  ArrayMinSize,
  ArrayMaxSize,
} from 'class-validator';

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
