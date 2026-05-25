/**
 * Escapuje regex special chars pro bezpečné použití v Mongo `$regex` filter.
 * Bez escape by uživatelský search `.*` mohl spustit DoS regex přes user input.
 *
 * @example escapeRegex('a.b*c') // → 'a\\.b\\*c'
 */
export function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
