import { Injectable, Logger } from '@nestjs/common';

/** Normalizovaný tvar porušení, nezávislý na tom, kterým formátem dorazilo. */
export interface CspViolation {
  /** Která direktiva porušení vyvolala, např. `img-src`. */
  directive: string;
  /** Co bylo zablokováno (URL nebo `inline`/`eval`). */
  blockedUri: string;
  /** Stránka, na které k porušení došlo. */
  documentUri: string;
}

/** Delší hodnoty do logu nepustíme — pole plní prohlížeč z cizí stránky. */
const MAX_FIELD = 200;
/** Jak dlouho po zalogování držet stejné porušení zticha. */
const DEDUPE_WINDOW_MS = 10 * 60 * 1000;
/** Strop paměti deduplikace (počet různých porušení). */
const DEDUPE_MAX_KEYS = 500;

function str(value: unknown): string {
  return typeof value === 'string' ? value.slice(0, MAX_FIELD) : '';
}

/**
 * 24.2 — přijímá surové CSP reporty, normalizuje je a loguje.
 *
 * Vědomě NEUKLÁDÁ do DB: cílem je odhalit vlastní chyby ve whitelistu (jako byl
 * `i.ytimg.com` vs `img.youtube.com`), ne stavět bezpečnostní SIEM. Log +
 * deduplikace stačí; kdyby se ukázalo, že reportů je hodně a jsou užitečné,
 * půjde je později přesměrovat na Sentry (23.4) bez zásahu do FE.
 */
@Injectable()
export class CspReportService {
  private readonly logger = new Logger('CspReport');
  /** klíč porušení → čas posledního zalogování */
  private readonly seen = new Map<string, number>();

  /**
   * Zpracuje tělo requestu v obou formátech. Cokoli nerozpoznaného tiše zahodí —
   * endpoint je veřejný, takže mu chodí i šum a nemá smysl kvůli němu logovat.
   */
  record(body: unknown): void {
    for (const violation of this.parse(body)) {
      if (this.shouldLog(violation)) {
        this.logger.warn(
          `CSP blok: ${violation.directive} → ${violation.blockedUri} (na ${violation.documentUri})`,
        );
      }
    }
  }

  /** Vytáhne porušení z obou možných tvarů těla. */
  private parse(body: unknown): CspViolation[] {
    if (!body || typeof body !== 'object') return [];

    // `report-to` (moderní Chrome): pole reportů, klíče v camelCase.
    if (Array.isArray(body)) {
      return body
        .filter(
          (item): item is { type?: string; body?: Record<string, unknown> } =>
            !!item && typeof item === 'object',
        )
        .filter(
          (item) => item.type === undefined || item.type === 'csp-violation',
        )
        .map((item) => this.fromReportTo(item.body ?? {}))
        .filter((v): v is CspViolation => v !== null);
    }

    // `report-uri` (Firefox/Safari): jeden objekt, klíče v kebab-case.
    const legacy = (body as Record<string, unknown>)['csp-report'];
    if (legacy && typeof legacy === 'object') {
      const v = this.fromReportUri(legacy as Record<string, unknown>);
      return v ? [v] : [];
    }
    return [];
  }

  private fromReportUri(r: Record<string, unknown>): CspViolation | null {
    // `effective-directive` je přesnější (`img-src`), `violated-directive` často
    // nese i zdrojový seznam — bereme první, co dorazí.
    const directive =
      str(r['effective-directive']) || str(r['violated-directive']);
    if (!directive) return null;
    return {
      directive,
      blockedUri: str(r['blocked-uri']) || '(neuvedeno)',
      documentUri: str(r['document-uri']) || '(neuvedeno)',
    };
  }

  private fromReportTo(r: Record<string, unknown>): CspViolation | null {
    const directive = str(r.effectiveDirective) || str(r.violatedDirective);
    if (!directive) return null;
    return {
      directive,
      blockedUri: str(r.blockedURL) || '(neuvedeno)',
      documentUri: str(r.documentURL) || '(neuvedeno)',
    };
  }

  /**
   * Deduplikace: rozbitá stránka pošle totéž porušení při každém načtení a log
   * má rotaci 10 MB × 3 — bez tlumení by nás jeden špatný whitelist připravil
   * o historii. Klíč je bez query stringu, aby `?id=…` nedělal z jednoho
   * porušení tisíc různých.
   */
  private shouldLog(v: CspViolation): boolean {
    const key = `${v.directive}|${v.blockedUri.split('?')[0]}|${v.documentUri.split('?')[0]}`;
    const now = Date.now();
    const last = this.seen.get(key);
    if (last !== undefined && now - last < DEDUPE_WINDOW_MS) return false;

    // Prevence neomezeného růstu: při naplnění zahodíme nejdéle nedotčený klíč.
    // `delete` před `set` je nutný — pouhý `set` existujícího klíče pořadí v Map
    // NEMĚNÍ, takže by čerstvě obnovený záznam zůstal na začátku a vyletěl by
    // dřív než skutečně staré položky.
    this.seen.delete(key);
    if (this.seen.size >= DEDUPE_MAX_KEYS) {
      const oldest = this.seen.keys().next();
      if (!oldest.done) this.seen.delete(oldest.value);
    }
    this.seen.set(key, now);
    return true;
  }
}
