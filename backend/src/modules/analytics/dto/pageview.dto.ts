import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * 15B.7 — tělo veřejného page-view pingu z SPA. Žádné PII;
 * `referrer` se na BE převede na kategorii a samotná URL se nikam neuloží.
 */
export class PageviewDto {
  @IsString()
  @MaxLength(200)
  path: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  referrer?: string;

  @IsString()
  @MaxLength(64)
  sessionId: string;

  @IsOptional()
  @IsBoolean()
  authed?: boolean;
}
