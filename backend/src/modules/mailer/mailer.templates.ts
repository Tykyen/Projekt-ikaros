import type {
  MailerTemplate,
  MailerPayload,
} from './interfaces/mailer-provider.interface';

/**
 * 1.7 / SMTP — renderování transakčních emailů (subject + text + HTML).
 *
 * Drženo mimo provider, aby šlo testovat čistě (bez SMTP) a sdílet mezi
 * případnými dalšími providery. HTML je inline-styled (mailoví klienti
 * nepodporují <style>/external CSS), branding Ikaros (fialová).
 */

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

const BRAND = 'Projekt Ikaros';

/** Escape HTML entit — username/email z DB se vkládají do HTML těla. */
function esc(value: string | undefined): string {
  return (value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function layout(title: string, bodyHtml: string): string {
  return `<!doctype html><html lang="cs"><body style="margin:0;background:#0d0a1a;padding:24px;font-family:Arial,Helvetica,sans-serif;color:#e8e6f5;">
  <div style="max-width:520px;margin:0 auto;background:#171430;border:1px solid #2a2350;border-radius:12px;overflow:hidden;">
    <div style="padding:20px 28px;background:linear-gradient(135deg,#3a1d6e,#6d28d9);">
      <h1 style="margin:0;font-size:18px;color:#ffffff;letter-spacing:.5px;">${BRAND}</h1>
    </div>
    <div style="padding:28px;line-height:1.55;">
      <h2 style="margin:0 0 16px;font-size:20px;color:#ffffff;">${title}</h2>
      ${bodyHtml}
    </div>
    <div style="padding:16px 28px;border-top:1px solid #2a2350;font-size:12px;color:#8a83b5;">
      Tento e-mail byl odeslán automaticky, neodpovídejte na něj.
    </div>
  </div>
</body></html>`;
}

function button(href: string, label: string): string {
  return `<a href="${href}" style="display:inline-block;padding:12px 22px;background:#7c3aed;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:bold;">${label}</a>`;
}

/** Sestaví FE odkaz z base URL + cesty + tokenu (token bezpečně enkódovaný). */
function link(base: string, path: string, token?: string): string {
  const root = base.replace(/\/+$/, '');
  return `${root}/${path}?token=${encodeURIComponent(token ?? '')}`;
}

export function renderEmail(
  template: MailerTemplate,
  payload: MailerPayload,
  appUrl: string,
): RenderedEmail {
  const name = esc(payload.username);

  switch (template) {
    case 'password_reset': {
      const href = link(appUrl, 'reset-password', payload.token);
      return {
        subject: `${BRAND} — obnovení hesla`,
        text: `Ahoj ${payload.username},\n\npozadal(a) jsi o obnoveni hesla. Otevri odkaz a nastav si nove heslo (plati 1 hodinu):\n${href}\n\nPokud jsi o reset nezadal(a), e-mail ignoruj.`,
        html: layout(
          'Obnovení hesla',
          `<p>Ahoj ${name},</p><p>požádal(a) jsi o obnovení hesla. Klikni a nastav si nové (odkaz platí 1 hodinu):</p><p>${button(href, 'Nastavit nové heslo')}</p><p style="font-size:13px;color:#8a83b5;">Pokud jsi o reset nežádal(a), tento e-mail ignoruj.</p>`,
        ),
      };
    }
    case 'email_verification': {
      const href = link(appUrl, 'email-verify', payload.token);
      return {
        subject: `${BRAND} — ověření e-mailu`,
        text: `Ahoj ${payload.username},\n\nover svuj e-mail otevrenim odkazu:\n${href}`,
        html: layout(
          'Ověření e-mailu',
          `<p>Ahoj ${name},</p><p>potvrď prosím svůj e-mail:</p><p>${button(href, 'Ověřit e-mail')}</p>`,
        ),
      };
    }
    case 'email_change_confirm': {
      const href = link(appUrl, 'email-change/confirm', payload.token);
      return {
        subject: `${BRAND} — potvrzení změny e-mailu`,
        text: `Ahoj ${payload.username},\n\npotvrd zmenu e-mailu otevrenim odkazu:\n${href}`,
        html: layout(
          'Změna e-mailu',
          `<p>Ahoj ${name},</p><p>potvrď prosím změnu e-mailu:</p><p>${button(href, 'Potvrdit změnu')}</p>`,
        ),
      };
    }
    case 'email_change_notice': {
      return {
        subject: `${BRAND} — e-mail účtu byl změněn`,
        text: `Ahoj ${payload.username},\n\ne-mail uctu byl zmenen z ${payload.oldEmail} na ${payload.newEmail}. Pokud jsi to nebyl(a) ty, ozvi se spravci.`,
        html: layout(
          'E-mail byl změněn',
          `<p>Ahoj ${name},</p><p>e-mail účtu byl změněn z <b>${esc(payload.oldEmail)}</b> na <b>${esc(payload.newEmail)}</b>.</p><p style="font-size:13px;color:#8a83b5;">Pokud jsi to nebyl(a) ty, ozvi se správci.</p>`,
        ),
      };
    }
    case 'username_decided': {
      return {
        subject: `${BRAND} — přezdívka schválena`,
        text: `Ahoj ${payload.username},\n\ntvoje prezdivka byla nastavena na ${payload.decidedUsername}.`,
        html: layout(
          'Přezdívka schválena',
          `<p>Ahoj ${name},</p><p>tvoje přezdívka byla nastavena na <b>${esc(payload.decidedUsername)}</b>.</p>`,
        ),
      };
    }
    case 'account_deletion_scheduled': {
      const when = payload.scheduledFor
        ? new Date(payload.scheduledFor).toLocaleDateString('cs-CZ')
        : '';
      return {
        subject: `${BRAND} — naplánováno smazání účtu`,
        text: `Ahoj ${payload.username},\n\ntvuj ucet je naplanovan ke smazani ${when}. Pokud sis to rozmyslel(a), prihlas se pred timto datem.`,
        html: layout(
          'Smazání účtu naplánováno',
          `<p>Ahoj ${name},</p><p>tvůj účet je naplánován ke smazání <b>${esc(when)}</b>. Pokud sis to rozmyslel(a), stačí se přihlásit před tímto datem.</p>`,
        ),
      };
    }
    case 'moderation_report_ack': {
      const when = payload.submittedAt
        ? new Date(payload.submittedAt).toLocaleString('cs-CZ')
        : '';
      const id = esc(payload.reportId);
      return {
        subject: `${BRAND} — přijali jsme tvé hlášení`,
        text: `Ahoj ${payload.username},\n\nprijali jsme tve hlaseni (ID ${payload.reportId ?? ''})${when ? ` z ${when}` : ''}. Posoudime ho co nejdrive; pokud sis vyzadal(a) informaci o vysledku, dame ti vedet.`,
        html: layout(
          'Hlášení přijato',
          `<p>Ahoj ${name},</p><p>přijali jsme tvé hlášení${id ? ` (ID <b>${id}</b>)` : ''}${when ? ` z <b>${esc(when)}</b>` : ''}.</p><p>Posoudíme ho co nejdříve. Pokud sis vyžádal(a) informaci o výsledku, dáme ti vědět.</p>`,
        ),
      };
    }
    case 'moderation_report_resolved': {
      const id = esc(payload.reportId);
      return {
        subject: `${BRAND} — tvé hlášení bylo vyřízeno`,
        text: `Ahoj ${payload.username},\n\ntve hlaseni (ID ${payload.reportId ?? ''}) jsme posoudili a vyridili. Dekujeme, ze pomahas udrzet platformu bezpecnou.`,
        html: layout(
          'Hlášení vyřízeno',
          `<p>Ahoj ${name},</p><p>tvé hlášení${id ? ` (ID <b>${id}</b>)` : ''} jsme posoudili a vyřídili.</p><p style="font-size:13px;color:#8a83b5;">Děkujeme, že pomáháš udržet platformu bezpečnou.</p>`,
        ),
      };
    }
  }
}
