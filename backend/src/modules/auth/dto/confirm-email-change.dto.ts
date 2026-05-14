import { IsString, MinLength, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ConfirmEmailChangeDto {
  @ApiProperty({ description: 'Plain email-change token z emailu' })
  @IsString()
  @MinLength(32)
  @MaxLength(128)
  token: string;
}
