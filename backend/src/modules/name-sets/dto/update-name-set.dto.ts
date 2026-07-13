/**
 * 21.2a — UpdateNameSetDto pro `PATCH /api/name-sets/community/:id`.
 * Partial — jen odeslaná pole; seznamy = plná náhrada pole.
 * `status`/`authorId` se přes update NEmění.
 */
import { PartialType } from '@nestjs/mapped-types';
import { CreateNameSetDto } from './create-name-set.dto';

export class UpdateNameSetDto extends PartialType(CreateNameSetDto) {}
