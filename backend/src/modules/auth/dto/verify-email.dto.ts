import { IsString, MinLength, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class VerifyEmailDto {
  @ApiProperty({ description: 'Plain verify token z emailu' })
  @IsString()
  @MinLength(32)
  @MaxLength(128)
  token: string;
}
