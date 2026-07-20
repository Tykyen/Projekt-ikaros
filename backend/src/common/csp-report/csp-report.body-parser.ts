import { json } from 'express';
import type { RequestHandler } from 'express';

/** Cesta endpointu včetně globálního prefixu (`setGlobalPrefix('api')`). */
export const CSP_REPORT_PATH = '/api/csp-report';

/**
 * 24.2 — body parser pro CSP reporty.
 *
 * Prohlížeče posílají porušení pod vlastními content-types, které expressí json
 * parser (bere jen `application/json`) ignoruje → `req.body` by dorazilo prázdné
 * a endpoint by tiše nezaznamenal nic.
 *
 * Konfigurace žije TADY a ne inline v `main.ts` schválně: e2e harness staví app
 * vlastní cestou (`test/helpers/app-factory.ts`) a bez sdílené funkce by test
 * ověřoval svou vlastní kopii nastavení místo té produkční — tedy přesně to
 * místo, kde by se drift schoval.
 */
export function cspReportBodyParser(): RequestHandler {
  return json({
    // `application/csp-report` = report-uri (Firefox/Safari)
    // `application/reports+json` = report-to (Chrome)
    type: ['application/csp-report', 'application/reports+json'],
    // Report je pár set bajtů a endpoint je veřejný → malý strop.
    limit: '64kb',
  });
}
