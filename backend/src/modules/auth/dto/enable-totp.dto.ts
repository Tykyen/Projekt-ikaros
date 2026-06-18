import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches } from 'class-validator';

export class EnableTotpDto {
  @ApiProperty({
    example: '123456',
    description: '6místný kód z authenticatoru',
  })
  @IsString()
  @Matches(/^\d{6}$/, { message: 'Kód musí být 6 číslic.' })
  code: string;
}
