import type { MailerTemplate } from './mailer-provider.interface';

/**
 * D-LAUNCH-GAP „SMTP bez fronty" — Mongo-backed mail outbox.
 *
 * 1 Gmail účet má cap ~500 mailů/den. Bez fronty burst (flood registrací,
 * hromadná notifikace) cap vyčerpá a legitimní maily (reset hesla!) tiše
 * selžou. Outbox: každý mail se nejdřív zapíše do `mail_outbox`, cron
 * (`MailOutboxSender`) posílá dávky dle priority+FIFO, s retry/backoffem a
 * denním počítadlem (`SMTP_DAILY_CAP`, default 400 = rezerva pod Gmail 500).
 * Po dosažení capu odchází UŽ JEN vysoká priorita (reset hesla), zbytek počká
 * na další den.
 */

/** Priorita — nižší číslo = dřív na řadě (sort `priority ASC, createdAt ASC`). */
export const MAIL_PRIORITY_HIGH = 1;
export const MAIL_PRIORITY_NORMAL = 5;

/**
 * Vysokou prioritu má JEN reset hesla — jediný mail, bez kterého se uživatel
 * NEDOSTANE do účtu. Verifikace registrace tu záměrně NENÍ: registrační flood
 * je přesně ten burst, před kterým cap chrání — kdyby verifikace obcházela
 * cap, útočník by rezervu pro resety vyčerpal registracemi.
 */
export const HIGH_PRIORITY_TEMPLATES: ReadonlySet<MailerTemplate> = new Set([
  'password_reset',
]);

export type MailOutboxStatus = 'pending' | 'sent' | 'failed';

export interface MailOutboxEntry {
  id: string;
  to: string;
  subject: string;
  text: string;
  html: string;
  /** = MailerTemplate (kategorie mailu pro diagnostiku + prioritizaci). */
  category: MailerTemplate;
  priority: number;
  status: MailOutboxStatus;
  /** Kolik odeslání už proběhlo (0 = ještě žádný pokus). */
  attempts: number;
  nextAttemptAt: Date;
  sentAt?: Date;
  /** Poslední SMTP chyba per adresát (bounce-lite evidence, viz D-AUDIT). */
  lastError?: string;
  /** SMTP odpověď při úspěchu („250 …") — důkaz PŘEDÁNÍ, ne doručení. */
  smtpResponse?: string;
  createdAt: Date;
}

export interface CreateMailOutboxInput {
  to: string;
  subject: string;
  text: string;
  html: string;
  category: MailerTemplate;
  priority: number;
  nextAttemptAt: Date;
}

export interface IMailOutboxRepository {
  create(input: CreateMailOutboxInput): Promise<MailOutboxEntry>;
  /**
   * Atomicky „vyzvedne" nejstarší due pending mail (priority ASC, createdAt
   * ASC) a posune mu `nextAttemptAt` o `leaseMs` dopředu — crash uprostřed
   * odeslání se tak sám zahojí (mail se po lease vrátí do due množiny) a dvě
   * instance si tentýž mail nevyzvednou. Vrací stav PŘED updatem (kvůli
   * `attempts`). `null` = nic due.
   */
  claimDue(now: Date, leaseMs: number): Promise<MailOutboxEntry | null>;
  markSent(id: string, sentAt: Date, smtpResponse?: string): Promise<void>;
  scheduleRetry(
    id: string,
    attempts: number,
    nextAttemptAt: Date,
    lastError: string,
  ): Promise<void>;
  markFailed(id: string, attempts: number, lastError: string): Promise<void>;
  /** Odloží mail (bez započítání pokusu) — denní cap dosažen, počká na další den. */
  defer(id: string, nextAttemptAt: Date): Promise<void>;
}

/**
 * Per-den počítadlo odeslaných mailů (Mongo dokument na UTC den) — sdílené
 * napříč restarty/replikami, na rozdíl od in-memory čítače.
 */
export interface IMailDailyCounterRepository {
  getSent(day: string): Promise<number>;
  /** Atomický $inc (upsert); vrací nový počet. */
  incrementSent(day: string): Promise<number>;
}
