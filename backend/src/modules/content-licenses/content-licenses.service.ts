import { Inject, Injectable } from '@nestjs/common';
import type {
  ContentLicense,
  ContentLicenseChange,
  CreateContentLicenseInput,
  IContentLicensesRepository,
} from './interfaces/content-license.interface';

/**
 * Spec 20D (D4) — tenká doménová vrstva nad repem licenční karty.
 *
 * PODKLAD (nenapojený): 21.5 (klonování/genealogie) sem sáhne, až bude
 * komunitní knihovna existovat. Zde jen CRUD + verzování, žádné gatování.
 */
@Injectable()
export class ContentLicensesService {
  constructor(
    @Inject('IContentLicensesRepository')
    private readonly repo: IContentLicensesRepository,
  ) {}

  /** Vytvoří první verzi licenční karty pro daný obsah. */
  create(input: CreateContentLicenseInput): Promise<ContentLicense> {
    return this.repo.create(input);
  }

  /**
   * Zapíše novou verzi (např. změna režimu). Nikdy nepřepisuje předchozí
   * verzi. `null`, pokud karta pro `contentId` neexistuje.
   */
  changeMode(
    contentId: string,
    change: ContentLicenseChange,
  ): Promise<ContentLicense | null> {
    return this.repo.createNewVersion(contentId, change);
  }

  getLatest(contentId: string): Promise<ContentLicense | null> {
    return this.repo.findLatest(contentId);
  }

  getVersions(contentId: string): Promise<ContentLicense[]> {
    return this.repo.findVersions(contentId);
  }
}
