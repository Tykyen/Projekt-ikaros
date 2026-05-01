import { IsString, MinLength, MaxLength, IsOptional, IsIn, IsArray, IsNumber, Min } from 'class-validator';

export class CreateChannelDto {
  @IsString() @MinLength(1) @MaxLength(64) name: string;
  @IsOptional() @IsIn(['all', 'roles', 'members']) accessMode?: 'all' | 'roles' | 'members';
  @IsOptional() @IsArray() @IsNumber({}, { each: true }) allowedRoles?: number[];
  @IsOptional() @IsArray() @IsString({ each: true }) allowedMemberIds?: string[];
  @IsOptional() @IsNumber() @Min(0) order?: number;
}
