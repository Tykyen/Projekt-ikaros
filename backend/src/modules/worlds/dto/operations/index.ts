import {
  MemberAssignToSceneOpDto,
  MemberUnassignOpDto,
  MemberBulkAssignToSceneOpDto,
} from './member-ops.dto';

/**
 * 10.2-prep-1 — registry cross-scene (world-level) op DTOs.
 *
 * Spec: docs/arch/maps/operations/data-models.md § WorldOperationPayload.
 */

type ClassType<T> = new (...args: unknown[]) => T;

export const WORLD_OPERATION_DTOS: Record<string, ClassType<object>> = {
  'member.assignToScene': MemberAssignToSceneOpDto,
  'member.unassign': MemberUnassignOpDto,
  'member.bulkAssignToScene': MemberBulkAssignToSceneOpDto,
};

export type WorldOperationType = keyof typeof WORLD_OPERATION_DTOS;

export type WorldOperationPayload =
  | MemberAssignToSceneOpDto
  | MemberUnassignOpDto
  | MemberBulkAssignToSceneOpDto;
