import { IsOptional, IsString, IsNumber, IsIn, Min, Max, IsBoolean } from 'class-validator';
import { WorldRole } from '../interfaces/world-membership.interface';

export class UpdateMemberRoleDto {
  @IsNumber() @IsIn([-1, 0, 1, 2, 3]) role: WorldRole;
}

export class UpdateMemberGroupDto {
  @IsOptional() @IsString() group?: string;
}

export class UpdateMemberAkjDto {
  @IsNumber() @Min(0) @Max(999999) akj: number;
}

export class UpdateMemberCharacterDto {
  @IsOptional() @IsString() characterPath?: string;
}

export class UpdateMemberFreeDto {
  @IsBoolean() isFree: boolean;
}
