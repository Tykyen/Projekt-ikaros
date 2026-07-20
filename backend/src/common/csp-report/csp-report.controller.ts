import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiExcludeEndpoint, ApiTags } from '@nestjs/swagger';
import { CspReportService } from './csp-report.service';

/**
 * 24.2 — sběrné místo pro porušení CSP.
 *
 * Do 24.2 běžel enforce na FE nginxu NASLEPO: co CSP zablokovala, se dozvěděl
 * jen uživatel v konzoli prohlížeče. Nález, který kartu odstartoval (v img-src
 * byl nepoužívaný `i.ytimg.com` místo reálného `img.youtube.com` → rozbité
 * náhledy videí), by se takhle ohlásil sám.
 *
 * Endpoint je ZÁMĚRNĚ veřejný a bez autentizace — reporty posílá prohlížeč,
 * který u nich neposílá cookies ani hlavičky. Proto je tvrdě rate-limitovaný
 * a všechno, co jde do logu, se ořezává (viz service).
 */
@ApiTags('Security')
@Controller('csp-report')
export class CspReportController {
  constructor(private readonly service: CspReportService) {}

  /**
   * Přijímá OBA formáty, protože se prohlížeče neshodnou:
   *   • `report-uri` → `application/csp-report`, objekt `{"csp-report": {…}}`
   *   • `report-to`  → `application/reports+json`, POLE reportů
   * Parser pro tyhle content-types je registrovaný v `main.ts` (express json
   * defaultně čte jen `application/json`, jinak by body dorazilo prázdné).
   *
   * `body: unknown` je úmysl: globální ValidationPipe má `forbidNonWhitelisted`,
   * takže jakékoli DTO by na cizích/kebab-case polích vracelo 400. Prohlížeči
   * navíc nemáme co vracet — 400 by nikdo nečetl.
   */
  @Post()
  @HttpCode(204)
  // Jedna rozbitá stránka umí vygenerovat desítky porušení naráz; limit drží
  // flood v mezích, zbytek dořeší deduplikace v service.
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  @ApiExcludeEndpoint()
  report(@Body() body: unknown): void {
    this.service.record(body);
  }
}
