import {
  IsString,
  MinLength,
  MaxLength,
  IsOptional,
  IsIn,
  IsArray,
  IsNumber,
  Min,
} from 'class-validator';

export class UpdateChannelDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(64) name?: string;
  @IsOptional() @IsIn(['all', 'roles', 'members']) accessMode?:
    | 'all'
    | 'roles'
    | 'members';
  @IsOptional()
  @IsArray()
  @IsNumber({}, { each: true })
  allowedRoles?: number[];
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allowedMemberIds?: string[];
  @IsOptional() @IsNumber() @Min(0) order?: number;
  @IsOptional() @IsString() @MaxLength(32) type?: string;
  @IsOptional() @IsString() @MaxLength(512) imageUrl?: string;
  /** Přesun konverzace do jiného kanálu — target group musí být ve stejném světě. */
  @IsOptional() @IsString() groupId?: string;
}
