import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

/** 14.1 — re-auth heslem pro citlivé 2FA akce (disable, regenerate). */
export class PasswordConfirmDto {
  @ApiProperty({ description: 'Aktuální heslo uživatele' })
  @IsString()
  @MinLength(6)
  password: string;
}
