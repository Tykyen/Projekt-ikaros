import { IsString, MinLength, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({
    description: 'E-mail (pokud obsahuje @) nebo přezdívka uživatele',
    example: 'alice@example.com',
  })
  @IsString()
  @MinLength(1, { message: 'Zadej e-mail nebo přezdívku' })
  @MaxLength(255)
  identifier: string;

  @ApiProperty({ description: 'Heslo' })
  @IsString()
  @MinLength(1, { message: 'Zadej heslo' })
  password: string;
}
