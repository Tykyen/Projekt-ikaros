import {
  IsOptional,
  IsString,
  IsInt,
  Min,
  Max,
  MaxLength,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class BanUserDto {
  @ApiProperty({ required: false, description: 'Důvod banu (audit log)' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  @ApiProperty({
    required: false,
    description: 'Délka banu ve dnech (0 = trvalý). 0–3650.',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(3650)
  durationDays?: number;
}
