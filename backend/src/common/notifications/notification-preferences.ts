/**
 * 15.9 — Notifikační preference (push). Jediný zdroj pravdy pro kategorie a
 * jejich defaulty. Sdílí BE filtr push (PushService) i endpoint /users/me.
 *
 * Defaulty se NEUKLÁDAJÍ do DB — pole `undefined` znamená „použij default z kódu".
 * Tím změna defaultu platí i pro účty, které si nic nenastavily.
 *
 * FE drží vlastní kopii (oddělená repa) — při změně kategorie aktualizovat obě
 * (vzor dual-source jako THEME_IDS).
 */

/** Kategorie, které lze vypnout/zapnout (mimo master `pushEnabled`). */
export type NotificationCategory =
  | 'worldChat'
  | 'worldEvent'
  | 'ownDiscussion'
  | 'ownContent'
  | 'worldNews'
  | 'ikarosNews'
  | 'hospoda'
  | 'adminChat'
  | 'posta';

export interface NotificationPreferences {
  /** Master vypínač push. Default true. `false` = žádný push bez ohledu na kategorie. */
  pushEnabled?: boolean;
  /** Zpráva v chatu světa, kde jsem člen. */
  worldChat?: boolean;
  /** Herní akce ve světě — vytvoření + připomínky 24h/1h. */
  worldEvent?: boolean;
  /** Nový příspěvek v diskusi, kterou jsem založil. */
  ownDiscussion?: boolean;
  /** Schválení/zamítnutí/hodnocení mého článku nebo galerie. */
  ownContent?: boolean;
  /** Nová novinka ve světě, jehož jsem člen. */
  worldNews?: boolean;
  /** Nová platformová novinka Ikarosu. */
  ikarosNews?: boolean;
  /** Nová zpráva v Hospodě (globální chat). Default VYP (opt-in). */
  hospoda?: boolean;
  /** Nová zpráva v interním chatu správy platformy (/admin/chat). Default ZAP. */
  adminChat?: boolean;
  /** Nová zpráva v Poště (soukromá zpráva / systémové oznámení). Default ZAP. */
  posta?: boolean;
}

/** Default stav každé kategorie. Vše ZAP kromě Hospody. */
export const NOTIFICATION_CATEGORY_DEFAULTS: Record<
  NotificationCategory,
  boolean
> = {
  worldChat: true,
  worldEvent: true,
  ownDiscussion: true,
  ownContent: true,
  worldNews: true,
  ikarosNews: true,
  hospoda: false,
  adminChat: true,
  posta: true,
};

export const NOTIFICATION_CATEGORIES = Object.keys(
  NOTIFICATION_CATEGORY_DEFAULTS,
) as NotificationCategory[];

/** Master push default. */
export const PUSH_ENABLED_DEFAULT = true;

/**
 * Chce uživatel push dané kategorie? `undefined` pole → default kategorie;
 * `pushEnabled === false` → vždy false. Toto je brána pro BE filtr.
 */
export function wantsPush(
  prefs: NotificationPreferences | undefined | null,
  category: NotificationCategory,
): boolean {
  if (prefs?.pushEnabled === false) return false;
  const v = prefs?.[category];
  return v === undefined ? NOTIFICATION_CATEGORY_DEFAULTS[category] : v;
}

/** Resolved hodnota libovolného klíče (default-fill) — pro UI i čtení. */
export function resolvePref(
  prefs: NotificationPreferences | undefined | null,
  key: keyof NotificationPreferences,
): boolean {
  if (key === 'pushEnabled') {
    return prefs?.pushEnabled ?? PUSH_ENABLED_DEFAULT;
  }
  const v = prefs?.[key];
  return v === undefined ? NOTIFICATION_CATEGORY_DEFAULTS[key] : v;
}
