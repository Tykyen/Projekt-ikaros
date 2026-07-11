import { isMediaUrl } from './media-url.guard';

/**
 * PT-32 (skill `pentest`, T1 unit pin) — SSRF egress gate ve world-exportu.
 *
 * Regresní pojistka opravy `c8c1b9e`: dřívější gate propustil JAKOUKOLI http URL
 * s media příponou nebo podřetězcem „cloudinary" → PJ vlastního světa vložil
 * `imageUrl` mířící na interní síť a export mu bajty odpovědi zabalil do ZIP.
 * Gate teď = striktní origin-allowlist (jen https Cloudinary). Když tento test
 * zčervená, SSRF díra se vrátila.
 */
describe('PT-32 · world-export SSRF gate (isMediaUrl)', () => {
  describe('ODMÍTNE útočné / cizí URL', () => {
    const blocked = [
      // Cloud metadata endpoint (klasický SSRF cíl)
      'http://169.254.169.254/latest/meta-data/iam/security-credentials/?x=cloudinary',
      'https://169.254.169.254/latest/meta-data/',
      // Interní služby v docker síti
      'http://redis:6379/',
      'http://meilisearch:7700/',
      'http://localhost:3001/api/health',
      'http://127.0.0.1/',
      // Media přípona sama NESTAČÍ (dřív propustila)
      'http://169.254.169.254/x.png',
      'https://evil.example.com/avatar.jpg',
      // Podřetězec „cloudinary" mimo host NESTAČÍ (dřív propustil)
      'https://evil.example.com/?redirect=cloudinary',
      'https://cloudinary.evil.com/x.png',
      // Nešifrované i vadné
      'http://res.cloudinary.com/demo/image/upload/x.png',
      'not-a-url',
      '/static/relative.png',
      'ftp://res.cloudinary.com/x.png',
    ];
    it.each(blocked)('blokuje %s', (url) => {
      expect(isMediaUrl(url)).toBe(false);
    });
  });

  describe('POVOLÍ legitimní Cloudinary média', () => {
    const allowed = [
      'https://res.cloudinary.com/demo/image/upload/v1/sample.webp',
      'https://res.cloudinary.com/ikaros/image/upload/w_400,q_auto,f_auto/avatar.png',
      'https://sub.cloudinary.com/x.jpg',
    ];
    it.each(allowed)('pustí %s', (url) => {
      expect(isMediaUrl(url)).toBe(true);
    });
  });
});
