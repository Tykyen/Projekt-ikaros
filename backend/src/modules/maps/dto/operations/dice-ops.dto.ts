import {
  Equals,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class DiceRollPayloadDto {
  @IsString() id!: string;
  @IsString() rolledAt!: string; // ISO
  @IsString() byUserId!: string;
  @IsString() rollerName!: string;
  @IsIn(['pc', 'pj', 'npc', 'bestie']) rollerKind!: string;
  @IsIn(['skill', 'initiative', 'custom']) category!: string;
  @IsOptional() @IsString() tokenId?: string;
  /** DicePayload (discriminated union z 6.3) — uloženo jako Mixed. */
  @IsObject() dicePayload!: Record<string, unknown>;
  [key: string]: unknown;
}

export class DiceRollOpDto {
  @Equals('dice.roll') type!: 'dice.roll';
  @IsObject()
  @ValidateNested()
  @Type(() => DiceRollPayloadDto)
  roll!: DiceRollPayloadDto;
}
