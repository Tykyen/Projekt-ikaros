import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

/** 14.1 — dokončení loginu druhým faktorem (po `status:'totp_required'`). */
export class LoginTotpDto {
  @ApiProperty({ description: 'challengeId z kroku 1 (login)' })
  @IsString()
  @MaxLength(128)
  challengeId: string;

  @ApiProperty({ description: '6místný TOTP kód nebo jednorázový záložní kód' })
  @IsString()
  @MaxLength(64)
  code: string;

  @ApiProperty({
    required: false,
    description: 'Důvěřovat tomuto zařízení 30 dní',
  })
  @IsOptional()
  @IsBoolean()
  trustDevice?: boolean;
}
