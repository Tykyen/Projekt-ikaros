import { IsString, IsOptional, MaxLength } from 'class-validator';

export class UpdateUserDto {
  @IsOptional() @IsString() @MaxLength(32) displayName?: string;
  @IsOptional() @IsString() avatarUrl?: string;
  @IsOptional() @IsString() characterPath?: string;
  @IsOptional() @IsString() ikarosSkin?: string;
}
