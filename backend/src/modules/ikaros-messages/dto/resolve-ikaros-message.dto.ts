import { IsBoolean, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { WorldRole } from '../../worlds/interfaces/world-membership.interface';

export class ResolveIkarosMessageDto {
  @IsBoolean()
  accept: boolean;

  @IsOptional() @IsString() @MaxLength(1000)
  reason?: string;

  @IsOptional() @IsEnum(WorldRole)
  role?: WorldRole;

  @IsOptional() @IsString()
  group?: string;

  @IsOptional() @IsString()
  characterPath?: string;

  @IsOptional() @IsBoolean()
  isFree?: boolean;
}
