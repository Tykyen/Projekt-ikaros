/**
 * Spec 20D (D3) — samostatný audit log souhlasů při uploadu obsahu.
 *
 * Slouží jako DOKLAD, že uživatel při nahrání prohlásil práva k obsahu
 * (obrana proti nároku třetí strany). Záznamy se NEMAŽOU (audit stopa) a
 * nežijí na cílové entitě — proto samostatná kolekce `upload_consents`.
 *
 * Zatím zapisuje galerie (D1); avatary / page-images půjdou stejným vzorem.
 */

/** Typ cíle, ke kterému se consent váže. Rozšiřitelný. */
export type UploadConsentTargetType = 'gallery' | 'avatar' | 'page_image';

/** Zatím jen upload; budoucí akce (např. `reupload`) přibudou. */
export type UploadConsentAction = 'upload';

export interface UploadConsent {
  id: string;
  /** Uživatel, který prohlášení učinil. */
  userId: string;
  targetType: UploadConsentTargetType;
  /** ID vzniklé entity (u galerie id obrázku). Volitelné (může chybět u draftu). */
  targetId?: string;
  action: UploadConsentAction;
  /** Vždy true — záznam vzniká jen při uděleném souhlasu. */
  rightsDeclared: true;
  /** Zaškrtl autor „vytvořeno AI"? */
  aiDeclared: boolean;
  /** Verze podmínek platná pro uživatele v okamžiku uploadu. */
  termsVersion: string;
  /** Volitelně IP z requestu (best-effort doklad). */
  ip?: string;
  createdAtUtc: Date;
}

/** Vstup pro zápis consentu (bez `id`, které přiděluje DB). */
export interface RecordUploadConsentInput {
  userId: string;
  targetType: UploadConsentTargetType;
  targetId?: string;
  aiDeclared: boolean;
  termsVersion: string;
  ip?: string;
}

export interface IUploadConsentsRepository {
  create(data: Omit<UploadConsent, 'id'>): Promise<UploadConsent>;
  findByUser(userId: string): Promise<UploadConsent[]>;
  findByTarget(
    targetType: UploadConsentTargetType,
    targetId: string,
  ): Promise<UploadConsent[]>;
}
