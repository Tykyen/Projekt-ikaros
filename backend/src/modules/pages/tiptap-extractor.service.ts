import { Injectable } from '@nestjs/common';

@Injectable()
export class TipTapExtractor {
  extract(html: string): string {
    return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  }
}
