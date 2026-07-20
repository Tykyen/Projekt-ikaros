import request from 'supertest';
import { Logger } from '@nestjs/common';
import { createTestApp, TestApp } from './helpers/app-factory';
import { CspReportModule } from '../src/common/csp-report/csp-report.module';
import {
  CSP_REPORT_PATH,
  cspReportBodyParser,
} from '../src/common/csp-report/csp-report.body-parser';

/**
 * 24.2 — endpoint pro sběr porušení CSP.
 *
 * Těžiště testu je BODY PARSER, ne logika (tu pokrývá `csp-report.service.spec`).
 * Reporty chodí pod `application/csp-report` a `application/reports+json`, které
 * expressí json parser sám od sebe nečte — kdyby chyběla registrace, endpoint by
 * vracel spokojené 204 a přitom nezaznamenal NIC. Přesně takové tiché selhání
 * karta 24.2 řešila u CSP whitelistu, tak ať se neopakuje o patro níž.
 */
describe('CSP report (e2e, 24.2)', () => {
  let testApp: TestApp;
  let warn: jest.SpyInstance;

  beforeAll(async () => {
    testApp = await createTestApp({
      modules: [CspReportModule],
      // Tentýž parser jako `main.ts` — sdílená funkce, ne kopie nastavení.
      configure: (app) => app.use(CSP_REPORT_PATH, cspReportBodyParser()),
    });
  });

  afterAll(async () => {
    await testApp.close();
  });

  beforeEach(() => {
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
  });

  afterEach(() => jest.restoreAllMocks());

  it('přijme report-uri (application/csp-report) a zaznamená ho', async () => {
    const res = await request(testApp.app.getHttpServer())
      .post('/api/csp-report')
      .set('Content-Type', 'application/csp-report')
      .send(
        JSON.stringify({
          'csp-report': {
            'document-uri': 'https://projekt-ikaros.com/svet/x',
            'effective-directive': 'img-src',
            'blocked-uri': 'https://img.youtube.com/vi/abc/mqdefault.jpg',
          },
        }),
      );

    expect(res.status).toBe(204);
    // Klíčová aserce: parser body opravdu naparsoval (jinak by se nelogovalo nic).
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain('img-src');
  });

  it('přijme report-to (application/reports+json) a zaznamená ho', async () => {
    const res = await request(testApp.app.getHttpServer())
      .post('/api/csp-report')
      .set('Content-Type', 'application/reports+json')
      .send(
        JSON.stringify([
          {
            type: 'csp-violation',
            body: {
              documentURL: 'https://projekt-ikaros.com/ikaros/galerie',
              effectiveDirective: 'font-src',
              blockedURL: 'https://cdn.zlo.test/f.woff2',
            },
          },
        ]),
      );

    expect(res.status).toBe(204);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain('font-src');
  });

  /**
   * Globální ValidationPipe má `forbidNonWhitelisted` — kdyby endpoint dostal
   * DTO, kebab-case pole reportu by skončila na 400 a prohlížeč by hlášení
   * zahodil. Test drží `body: unknown` na místě.
   */
  it('nevrací 400 na neznámá pole v reportu', async () => {
    const res = await request(testApp.app.getHttpServer())
      .post('/api/csp-report')
      .set('Content-Type', 'application/csp-report')
      .send(
        JSON.stringify({
          'csp-report': {
            'effective-directive': 'script-src',
            'blocked-uri': 'inline',
            'script-sample': 'alert(1)',
            'status-code': 200,
            'nikdy-nevidene-pole': true,
          },
        }),
      );

    expect(res.status).toBe(204);
  });

  it('nespadne na prázdném ani nesmyslném těle', async () => {
    const empty = await request(testApp.app.getHttpServer())
      .post('/api/csp-report')
      .set('Content-Type', 'application/csp-report')
      .send('');
    expect(empty.status).toBe(204);

    const junk = await request(testApp.app.getHttpServer())
      .post('/api/csp-report')
      .set('Content-Type', 'application/csp-report')
      .send(JSON.stringify({ neco: 'jineho' }));
    expect(junk.status).toBe(204);

    expect(warn).not.toHaveBeenCalled();
  });
});
