import { IsEmail, IsString, MinLength, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RequestEmailChangeDto {
  @ApiProperty({ description: 'Nový e-mail uživatele' })
  @IsEmail()
  @MaxLength(255)
  newEmail: string;

  @ApiProperty({ description: 'Aktuální heslo pro ověření' })
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  currentPassword: string;
}
