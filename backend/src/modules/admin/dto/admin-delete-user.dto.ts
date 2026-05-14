import { IsString, MinLength, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AdminDeleteUserDto {
  @ApiProperty({ description: 'Povinný důvod smazání (audit)' })
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  reason: string;
}
