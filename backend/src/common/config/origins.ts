/**
 * Jediný zdroj povolených CORS/WS originů (PC-04 / PC-13 — production-config-audit).
 *
 * Před tímto helperem se origin skládal nezávisle v `main.ts`, `socket-io.adapter.ts`
 * a v `@WebSocketGateway` dekorátorech 13 gateway — s hardcoded `localhost:5174`
 * bezpodmínečně i v produkci. Tady je to jedno místo: v produkci JEN `FRONTEND_URL`,
 * dev varianty (`5173`/`5174`) se přidají pouze mimo produkci.
 */
export function getAllowedOrigins(): string[] {
  const frontend = process.env.FRONTEND_URL ?? 'http://localhost:5173';
  const origins = [frontend];
  if (process.env.NODE_ENV !== 'production') {
    origins.push('http://localhost:5173', 'http://localhost:5174');
  }
  return [...new Set(origins)];
}

/** Single origin pro statické assety (CORS header musí být jedna hodnota). */
export function getPrimaryOrigin(): string {
  return process.env.FRONTEND_URL ?? 'http://localhost:5173';
}
