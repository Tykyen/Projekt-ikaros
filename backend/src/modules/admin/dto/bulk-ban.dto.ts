import {
  IsArray,
  ArrayMaxSize,
  ArrayMinSize,
  IsString,
  IsOptional,
  IsInt,
  Min,
  Max,
  MaxLength,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class BulkBanDto {
  @ApiProperty({ description: 'User IDs, max 100' })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @IsString({ each: true })
  userIds: string[];

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  @ApiProperty({ required: false, description: '0 = trvalý' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(3650)
  durationDays?: number;
}
