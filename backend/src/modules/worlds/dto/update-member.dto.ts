import { IsOptional, IsString, IsNumber, IsIn } from 'class-validator';
import { WorldRole } from '../interfaces/world-membership.interface';

export class UpdateMemberRoleDto {
  @IsNumber() @IsIn([-1, 0, 1, 2, 3]) role: WorldRole;
}

export class UpdateMemberGroupDto {
  @IsOptional() @IsString() group?: string;
}

export class UpdateMemberAkjDto {
  @IsNumber() akj: number;
}

export class UpdateMemberCharacterDto {
  @IsOptional() @IsString() characterPath?: string;
}
