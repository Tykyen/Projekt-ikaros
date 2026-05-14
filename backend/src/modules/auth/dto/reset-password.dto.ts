import { IsString, MinLength, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ResetPasswordDto {
  @ApiProperty({ description: 'Plain reset token z emailu' })
  @IsString()
  @MinLength(32)
  @MaxLength(128)
  token: string;

  @ApiProperty({ description: 'Nové heslo (min 8 znaků)' })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password: string;
}
