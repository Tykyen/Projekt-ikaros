import { Logger } from '@nestjs/common';
import { CspReportService } from './csp-report.service';

describe('CspReportService (24.2)', () => {
  let service: CspReportService;
  let warn: jest.SpyInstance;

  beforeEach(() => {
    service = new CspReportService();
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
  });

  afterEach(() => jest.restoreAllMocks());

  /** Formát `report-uri` — Firefox/Safari, kebab-case klíče. */
  it('zpracuje report-uri formát', () => {
    service.record({
      'csp-report': {
        'document-uri': 'https://projekt-ikaros.com/svet/x',
        'effective-directive': 'img-src',
        'blocked-uri': 'https://img.youtube.com/vi/abc/mqdefault.jpg',
      },
    });

    expect(warn).toHaveBeenCalledTimes(1);
    const msg = warn.mock.calls[0][0] as string;
    expect(msg).toContain('img-src');
    expect(msg).toContain('img.youtube.com');
  });

  /** Formát `report-to` — Chrome, POLE reportů, camelCase klíče. */
  it('zpracuje report-to formát (pole)', () => {
    service.record([
      {
        type: 'csp-violation',
        body: {
          documentURL: 'https://projekt-ikaros.com/ikaros/galerie',
          effectiveDirective: 'script-src',
          blockedURL: 'https://evil.example/x.js',
        },
      },
    ]);

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain('script-src');
  });

  it('zpracuje všechny položky pole naráz', () => {
    service.record([
      {
        body: { effectiveDirective: 'img-src', blockedURL: 'https://a.test/1' },
      },
      {
        body: {
          effectiveDirective: 'font-src',
          blockedURL: 'https://b.test/2',
        },
      },
    ]);

    expect(warn).toHaveBeenCalledTimes(2);
  });

  /** Bez tlumení by rozbitá stránka zaplavila log při každém načtení. */
  it('stejné porušení zaloguje jen jednou (deduplikace)', () => {
    const report = {
      'csp-report': {
        'document-uri': 'https://projekt-ikaros.com/a',
        'effective-directive': 'img-src',
        'blocked-uri': 'https://blokovano.test/x.png',
      },
    };

    service.record(report);
    service.record(report);
    service.record(report);

    expect(warn).toHaveBeenCalledTimes(1);
  });

  /** Query string nesmí z jednoho porušení udělat tisíc různých klíčů. */
  it('ignoruje query string při deduplikaci', () => {
    const make = (id: number) => ({
      'csp-report': {
        'document-uri': `https://projekt-ikaros.com/svet/x?id=${id}`,
        'effective-directive': 'img-src',
        'blocked-uri': `https://blokovano.test/x.png?v=${id}`,
      },
    });

    service.record(make(1));
    service.record(make(2));

    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('rozliší různá porušení', () => {
    service.record({
      'csp-report': {
        'effective-directive': 'img-src',
        'blocked-uri': 'https://a.test/1',
      },
    });
    service.record({
      'csp-report': {
        'effective-directive': 'font-src',
        'blocked-uri': 'https://a.test/1',
      },
    });

    expect(warn).toHaveBeenCalledTimes(2);
  });

  /** Pole plní prohlížeč z cizí stránky → do logu nesmí dlouhé řetězce. */
  it('ořízne přehnaně dlouhé hodnoty', () => {
    service.record({
      'csp-report': {
        'document-uri': 'https://projekt-ikaros.com/a',
        'effective-directive': 'img-src',
        'blocked-uri': `https://zlo.test/${'A'.repeat(5000)}`,
      },
    });

    expect((warn.mock.calls[0][0] as string).length).toBeLessThan(600);
  });

  /** Endpoint je veřejný — šum se tiše zahazuje, ne loguje. */
  it.each([
    ['null', null],
    ['prázdný objekt', {}],
    ['řetězec', 'nesmysl'],
    ['pole nesmyslů', ['a', 1, null]],
    [
      'csp-report bez direktivy',
      { 'csp-report': { 'blocked-uri': 'https://a.test' } },
    ],
  ])('tiše zahodí nerozpoznané tělo: %s', (_label, body) => {
    service.record(body);
    expect(warn).not.toHaveBeenCalled();
  });

  it('přeskočí reporty jiného typu než csp-violation', () => {
    service.record([
      {
        type: 'deprecation',
        body: { effectiveDirective: 'img-src', blockedURL: 'https://a.test' },
      },
    ]);

    expect(warn).not.toHaveBeenCalled();
  });

  /** `violated-directive` je fallback, když chybí přesnější `effective-directive`. */
  it('použije violated-directive jako fallback', () => {
    service.record({
      'csp-report': {
        'violated-directive': "img-src 'self'",
        'blocked-uri': 'https://a.test/1',
      },
    });

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain('img-src');
  });
});
