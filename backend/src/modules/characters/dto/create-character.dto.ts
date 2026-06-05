import {
  IsString,
  IsOptional,
  IsBoolean,
  IsIn,
  MaxLength,
} from 'class-validator';

export class CreateCharacterDto {
  @IsString() slug: string;
  @IsString() @MaxLength(200) name: string;
  @IsOptional() @IsString() userId?: string;
  @IsBoolean() isNpc: boolean;
  /** Spec 9.2 — viz Character.kind v interface. Default 'persona'. */
  @IsOptional() @IsIn(['persona', 'location']) kind?: 'persona' | 'location';
  @IsOptional() @IsString() campaignSubjectId?: string;
}
