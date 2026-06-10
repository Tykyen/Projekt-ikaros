import { renderEmail } from './mailer.templates';
import type { MailerTemplate } from './interfaces/mailer-provider.interface';

const APP_URL = 'https://newmatrix.patrikzplzne.cz';

describe('renderEmail', () => {
  it('password_reset — odkaz míří na /reset-password s tokenem', () => {
    const out = renderEmail(
      'password_reset',
      { to: 'a@b.cz', username: 'Tyna', token: 'abc123' },
      APP_URL,
    );
    expect(out.subject).toContain('obnovení hesla');
    const link = `${APP_URL}/reset-password?token=abc123`;
    expect(out.html).toContain(link);
    expect(out.text).toContain(link);
  });

  it('email_verification → /email-verify, email_change_confirm → /email-change/confirm', () => {
    expect(
      renderEmail(
        'email_verification',
        { to: 'a@b.cz', username: 'X', token: 't1' },
        APP_URL,
      ).html,
    ).toContain(`${APP_URL}/email-verify?token=t1`);

    expect(
      renderEmail(
        'email_change_confirm',
        { to: 'a@b.cz', username: 'X', token: 't2' },
        APP_URL,
      ).html,
    ).toContain(`${APP_URL}/email-change/confirm?token=t2`);
  });

  it('trailing slash v APP_URL nezdvojí lomítko', () => {
    const out = renderEmail(
      'password_reset',
      { to: 'a@b.cz', username: 'X', token: 'tok' },
      'https://example.com/',
    );
    expect(out.html).toContain('https://example.com/reset-password?token=tok');
    expect(out.html).not.toContain('com//reset-password');
  });

  it('token se URL-enkóduje', () => {
    const out = renderEmail(
      'password_reset',
      { to: 'a@b.cz', username: 'X', token: 'a b/c' },
      APP_URL,
    );
    expect(out.html).toContain('token=a%20b%2Fc');
  });

  it('username s HTML znaky se v HTML escapuje (anti-XSS)', () => {
    const out = renderEmail(
      'password_reset',
      { to: 'a@b.cz', username: '<script>x</script>', token: 't' },
      APP_URL,
    );
    expect(out.html).not.toContain('<script>x</script>');
    expect(out.html).toContain('&lt;script&gt;');
  });

  it('všech 6 šablon vrátí neprázdný subject/text/html', () => {
    const templates: MailerTemplate[] = [
      'password_reset',
      'email_verification',
      'email_change_confirm',
      'email_change_notice',
      'username_decided',
      'account_deletion_scheduled',
    ];
    for (const t of templates) {
      const out = renderEmail(
        t,
        {
          to: 'a@b.cz',
          username: 'U',
          token: 'tok',
          oldEmail: 'old@x.cz',
          newEmail: 'new@x.cz',
          decidedUsername: 'NoveJmeno',
          scheduledFor: new Date('2026-07-01'),
        },
        APP_URL,
      );
      expect(out.subject.length).toBeGreaterThan(0);
      expect(out.text.length).toBeGreaterThan(0);
      expect(out.html).toContain('<html');
    }
  });
});
