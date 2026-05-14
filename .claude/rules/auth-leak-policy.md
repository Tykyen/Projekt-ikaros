# Auth & info-leak policy

Pravidlo pro HTTP statusy při chybějících/odepřených zdrojích, sjednocené 2026-05-06.

## Pravidlo

| Endpoint kategorie | Neexistující zdroj | Existuje, ale není můj | Bez práv (auth/role) |
|---|---|---|---|
| **Anonymní** (bez JWT) | **403** anti-leak | **403** | n/a (nepoužíváme role) |
| **Auth-required** (s JWT) | **404** Not Found | **403** Forbidden | **403** Forbidden |

## Proč

- **Anonymní endpoint:** útočník bez tokenu by neměl být schopen zjistit, jestli daný `worldId`/`slug` existuje. Konzistentní 403 (i pro neexistuje, i pro existuje-ale-neautorizován) odepře leak.
- **Auth-required endpoint:** uživatel je už autentizován, leak existence zdroje je nízkorizikový. 404 vs 403 dává klientovi srozumitelnou diagnostiku ("špatné ID" vs "ne tvůj svět") — UX > anti-leak.

## Příklady

### Anonymní (403 anti-leak)
- `GET /world-news/:worldSlug` (public read) → 403 i pro neexistující slug
- `GET /world-news/:worldSlug/:newsId` → 403 i pro neexistující/cross-world

### Auth-required (404 + 403)
- `GET /worlds/:worldId/timeline` → **404** neexistuje, **403** ne-tvůj
- `GET /worlds/:worldId/timeline/:eventId` → **404** event neexistuje, **403** event v cizím světě (legitní distinkce)
- `PATCH /worlds/:worldId/calendars/:slug/settings` → **404** svět neexistuje, **403** nedostatečná role
- `POST /worlds/:worldId/timeline` (write) → **404** svět neexistuje, **403** ne ≥ PomocnyPJ

## Implementační pattern

Auth-required service pattern:
```typescript
private async assertCanWrite(worldId, requester) {
  if (requester.role <= UserRole.Admin) return; // global shortcut
  const world = await this.worldsRepo.findById(worldId);
  if (!world) throw new NotFoundException('Svět nenalezen'); // ← 404
  const m = await this.membershipRepo.findByUserAndWorld(requester.id, worldId);
  if (!m || m.role < WorldRole.PomocnyPJ) {
    throw new ForbiddenException('Nedostatečná oprávnění'); // ← 403
  }
}
```

Anonymní pattern (anti-leak):
```typescript
private async assertWorldExists(worldSlug) {
  const world = await this.worldsRepo.findBySlug(worldSlug);
  if (!world) throw new ForbiddenException('Přístup odepřen'); // ← 403
  return world;
}
```

## Rozhodnuté výjimky

- **Žádné.** Pokud najdeš endpoint, který tomuto neodpovídá, je to **bug** (zapsat do `docs/dluhy.md`).

## Související

- `world-news.service.ts` — anonymní vzor (403 všude)
- `timeline.service.ts:assertMember` — auth-required vzor (404 + 403)
- `calendars.service.ts:assertCanModerate` — auth-required vzor (404 + 403)
- `world-calendar-config.service.ts:assertCanWrite` — anti-leak v auth-required (legacy, plánováno přerovnání na 404)
