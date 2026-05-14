import { IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RejectRequestDto {
  @ApiProperty({ required: false, description: 'Důvod zamítnutí žádosti' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
