/**
 * 21.5d — UpdateRiddleDto pro `PATCH /api/riddles/community/:id`.
 * Hádanka nemá lore/statblock split (spec R5) → update mění všechna pole
 * naráz (autor nebo kurátor). `PartialType` = všechna pole Create volitelná.
 */
import { PartialType } from '@nestjs/mapped-types';
import { CreateRiddleDto } from './create-riddle.dto';

export class UpdateRiddleDto extends PartialType(CreateRiddleDto) {}
