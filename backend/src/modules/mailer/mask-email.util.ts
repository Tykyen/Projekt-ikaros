/**
 * FIX-48 / LH-03 (log hygiene): e-mail je PII → do logu jen maskovaně
 * (`t***@g***`). Sdílená verze pro outbox — mirror privátních
 * `MailerService.mask` / `SmtpMailerProvider.mask` (stejný algoritmus).
 */
export function maskEmail(email: string): string {
  const at = email.indexOf('@');
  if (at < 1) return '***';
  const domain = email.slice(at + 1);
  return `${email[0]}***@${domain[0] ?? ''}***`;
}
