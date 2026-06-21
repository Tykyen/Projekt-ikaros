/** Persistence pro per-svět elevaci platform admina (toggle bez TTL). */
export interface IWorldElevationsRepository {
  /** Idempotentní zapnutí elevace pro (uživatel, svět). */
  upsert(userId: string, worldId: string): Promise<void>;
  /** Vypnutí elevace pro (uživatel, svět). */
  delete(userId: string, worldId: string): Promise<void>;
  /** Seznam worldId, kde má uživatel aktivní elevaci (pro guard). */
  listWorldIds(userId: string): Promise<string[]>;
  /** Je uživatel elevated v daném světě? */
  exists(userId: string, worldId: string): Promise<boolean>;
  /** Smaže všechny elevace uživatele (logout / hard-delete účtu). */
  deleteAllForUser(userId: string): Promise<void>;
}
