export type MailerTemplate =
  | 'password_reset'
  | 'email_verification'
  | 'email_change_confirm'
  | 'email_change_notice'
  | 'username_decided'
  | 'account_deletion_scheduled';

export interface MailerPayload {
  to: string;
  username: string;
  // Variabilní podle template:
  token?: string; // password_reset, email_verification, email_change_confirm
  oldEmail?: string; // email_change_notice
  newEmail?: string; // email_change_notice
  decidedUsername?: string; // username_decided
  scheduledFor?: Date; // account_deletion_scheduled
}

/**
 * Provider rozhraní — konkrétní backend (Logger pro dev, SMTP/SendGrid pro prod).
 */
export interface IMailerProvider {
  send(template: MailerTemplate, payload: MailerPayload): Promise<void>;
}
