/**
 * Spec 20D (D4) — datový PODKLAD licenční karty obsahu (kolekce
 * `content_licenses`). Model se v D JEN vytvoří; NENAPOJUJE se na galerii,
 * knihovnu ani AI — to udělá až 21.5 (klonování/genealogie) / Fáze 18 (AI).
 *
 * Verzování: změna režimu = NOVÁ verze (nový záznam s vyšším `versionId`), ne
 * tichý přepis. Historie tak zůstává auditovatelná.
 */

/**
 * Režim licence. `private` = jen autor; `read` = veřejné čtení; `clone` =
 * povolena kopie; `remix` = povoleny odvozeniny; `open` = otevřená licence;
 * `official` = oficiální obsah platformy; `withdrawn` = staženo autorem;
 * `disputed` = sporné (nárok třetí strany / moderace).
 */
export type LicenseMode =
  | 'private'
  | 'read'
  | 'clone'
  | 'remix'
  | 'open'
  | 'official'
  | 'withdrawn'
  | 'disputed';

/**
 * Žebříček původu obsahu vůči AI (A0–A6). Přesné právní labely dodá právní
 * rámec (30/41-licencni-karta) / Fáze 18; do napojení slouží jako podklad:
 *  A0 = bez AI (čistě lidské dílo)
 *  A1 = AI asistováno (drobná výpomoc, autorské dílo člověka)
 *  A2 = AI rozšířeno (podstatná AI, člověk řídí a edituje)
 *  A3 = AI generováno, člověkem kurátorováno (prompt + výběr/úprava)
 *  A4 = AI generováno (surový výstup, minimální lidský zásah)
 *  A5 = AI odvozeno z existujícího / cizího díla
 *  A6 = neznámé / neuvedeno
 */
export type LicenseAiOrigin = 'A0' | 'A1' | 'A2' | 'A3' | 'A4' | 'A5' | 'A6';

/**
 * Stav materiálu třetí strany v obsahu (podklad, rozšiřitelný):
 * `none` = žádný cizí materiál; `licensed` = licencováno; `public_domain` =
 * volné dílo; `unknown` = neurčeno.
 */
export type ThirdPartyStatus =
  | 'none'
  | 'licensed'
  | 'public_domain'
  | 'unknown';

/** Stav přezkumu licenční karty (podklad). Default `pending`. */
export type LicenseReviewStatus =
  | 'pending'
  | 'approved'
  | 'flagged'
  | 'rejected';

/** Kompletní licenční karta (jedna verze). 17 perzistovaných polí + `id`. */
export interface ContentLicense {
  id: string;
  /** ID obsahu, ke kterému karta patří (napojení řeší 21.5). */
  contentId: string;
  /** Verze karty v rámci `contentId` ('1', '2', …). Změna režimu → nová verze. */
  versionId: string;
  ownerUserId: string;
  publicAuthorName: string;
  licenseMode: LicenseMode;
  cloneAllowed: boolean;
  derivativesAllowed: boolean;
  exportAllowed: boolean;
  aiOrigin: LicenseAiOrigin;
  thirdPartyStatus: ThirdPartyStatus;
  rpgSystemId?: string;
  attributionRequired: boolean;
  sourceUrlOrNote?: string;
  reviewStatus: LicenseReviewStatus;
  acceptedTermsVersion: string;
  parentContentId?: string;
  createdAtUtc: Date;
}

/** Vstup pro první verzi karty (repo doplní `id`, `versionId`, `createdAtUtc`). */
export type CreateContentLicenseInput = Omit<
  ContentLicense,
  'id' | 'versionId' | 'createdAtUtc'
>;

/**
 * Změny pro novou verzi. `contentId` je fixní (patří k obsahu). Vše ostatní
 * je volitelné — nezměněná pole se převezmou z předchozí verze.
 */
export type ContentLicenseChange = Partial<
  Omit<CreateContentLicenseInput, 'contentId'>
>;

export interface IContentLicensesRepository {
  /** Vytvoří verzi 1 pro nový `contentId`. */
  create(data: CreateContentLicenseInput): Promise<ContentLicense>;
  /**
   * Verzování — nová verze z posledního snapshotu + změn. NEpřepisuje starou
   * verzi. Vrátí `null`, pokud pro `contentId` žádná verze neexistuje.
   */
  createNewVersion(
    contentId: string,
    change: ContentLicenseChange,
  ): Promise<ContentLicense | null>;
  /** Nejnovější verze karty pro `contentId`. */
  findLatest(contentId: string): Promise<ContentLicense | null>;
  /** Všechny verze pro `contentId` (nejstarší první). */
  findVersions(contentId: string): Promise<ContentLicense[]>;
  findById(id: string): Promise<ContentLicense | null>;
}
