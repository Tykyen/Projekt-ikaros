import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { UserRole } from '../../users/interfaces/user.interface';

export class CreateUserAdminDto {
  @IsEmail() email: string;
  @IsString() @MinLength(3) @MaxLength(32) username: string;
  @IsString() @MinLength(6) @MaxLength(128) password: string;
  @IsOptional() @IsEnum(UserRole) role?: UserRole;
}
