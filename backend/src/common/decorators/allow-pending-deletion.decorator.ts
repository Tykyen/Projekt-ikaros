import { SetMetadata } from '@nestjs/common';

/**
 * 1.3c (N-6b) — opt-out z `JwtAuthGuard` deletion-pending gate.
 *
 * Routy označené tímto dekorátorem projdou i když má uživatel `deletionRequestedAt`
 * (ale stále NE pokud `isDeleted` — smazaný účet je vždy 401). Použití na
 * `GET/DELETE /users/me/deletion-request` — aby uživatel v 30denním holdu mohl
 * vidět stav i zrušit naplánované smazání z přihlášené session (access token žije
 * až 7 dní, takže krátké okno po requestu existuje).
 */
export const ALLOW_PENDING_DELETION = 'allowPendingDeletion';

export const AllowPendingDeletion = () =>
  SetMetadata(ALLOW_PENDING_DELETION, true);
