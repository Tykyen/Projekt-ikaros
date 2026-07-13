export type MailerTemplate =
  | 'password_reset'
  | 'email_verification'
  | 'email_change_confirm'
  | 'email_change_notice'
  | 'username_decided'
  | 'account_deletion_scheduled'
  // Spec 20B — moderace: potvrzení příjmu reportu + vyrozumění o vyřízení.
  | 'moderation_report_ack'
  | 'moderation_report_resolved';

export interface MailerPayload {
  to: string;
  username: string;
  // Variabilní podle template:
  token?: string; // password_reset, email_verification, email_change_confirm
  oldEmail?: string; // email_change_notice
  newEmail?: string; // email_change_notice
  decidedUsername?: string; // username_decided
  scheduledFor?: Date; // account_deletion_scheduled
  reportId?: string; // moderation_report_ack, moderation_report_resolved
  submittedAt?: Date; // moderation_report_ack
}

/** Už vyrenderovaný mail — přesně to, co odchází na SMTP (outbox ukládá tuhle podobu). */
export interface RenderedMailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/**
 * Provider rozhraní — konkrétní backend (Logger pro dev, SMTP/SendGrid pro prod).
 */
export interface IMailerProvider {
  /**
   * `true` → maily se řadí do Mongo outboxu (`mail_outbox`) a odesílá je cron
   * (`MailOutboxSender`) — denní cap, retry/backoff, priorita. `false` (dev
   * LogMailerProvider) → přímé odeslání, žádná fronta.
   */
  readonly queueable: boolean;

  send(template: MailerTemplate, payload: MailerPayload): Promise<void>;

  /**
   * Odešle už vyrenderovaný mail (outbox cesta). Vrací SMTP odpověď serveru
   * (např. „250 2.0.0 OK …") — ukládá se do outbox záznamu jako důkaz PŘEDÁNÍ,
   * ne doručení (bounce chodí async a bez inbound handlingu ho nevidíme).
   */
  sendRendered(mail: RenderedMailMessage): Promise<string | undefined>;
}
