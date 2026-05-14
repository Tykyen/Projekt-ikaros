import { IsEmail, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ForgotPasswordDto {
  @ApiProperty({
    description: 'E-mail uživatele',
    example: 'alice@example.com',
  })
  @IsEmail()
  @MaxLength(255)
  email: string;
}
