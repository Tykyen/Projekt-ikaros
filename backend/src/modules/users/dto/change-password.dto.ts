import { IsString, MinLength, MaxLength } from 'class-validator';

export class ChangePasswordDto {
  @IsString() @MinLength(1) @MaxLength(128) oldPassword: string;
  @IsString() @MinLength(8) @MaxLength(128) newPassword: string;
}
