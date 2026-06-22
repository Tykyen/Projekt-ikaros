import { Controller, Get, Header } from '@nestjs/common';
import { SeoService } from './seo.service';

/**
 * 15B.2 — veřejný (bez auth guardu) endpoint pro crawlery.
 * Globální prefix `api` → reálná routa `/api/sitemap.xml`; nginx mapuje
 * externí `/sitemap.xml` → `/api/sitemap.xml`.
 */
@Controller()
export class SeoController {
  constructor(private readonly seo: SeoService) {}

  @Get('sitemap.xml')
  @Header('Content-Type', 'application/xml; charset=utf-8')
  @Header('Cache-Control', 'public, max-age=3600')
  async sitemap(): Promise<string> {
    return this.seo.getSitemapXml();
  }
}
