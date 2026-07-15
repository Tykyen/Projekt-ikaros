import { ForbiddenException } from '@nestjs/common';

/**
 * 22.4 — veřejná výkladní skříň světa.
 *
 * Brána pro anonymní (nepřihlášené) čtení vitrínových sekcí světa. Kontrakt:
 * anonym vidí NEJVÝŠE to, co člen v roli Čtenář, a jen když PJ vitrínu vědomě
 * zapnul (`world.publicShowcase`). Private svět vitrínu mít nemůže.
 *
 * Volá se VÝHRADNĚ pro `user === undefined` větev endpointů s
 * `OptionalJwtAuthGuard`; přihlášení uživatelé jedou dnešními branami beze
 * změny. Spec: Projekt-ikaros-FE/docs/arch/phase-22/spec-22.4-*.md.
 */
export function assertShowcaseViewable(
  world:
    | {
        isActive?: boolean;
        deletedAt?: Date | null;
        accessMode?: string;
        publicShowcase?: boolean;
      }
    | null
    | undefined,
): void {
  if (
    !world ||
    world.isActive === false ||
    world.deletedAt != null ||
    world.accessMode === 'private' ||
    world.publicShowcase !== true
  ) {
    throw new ForbiddenException({
      code: 'SHOWCASE_DISABLED',
      message:
        'Tenhle obsah je dostupný jen členům světa. Přihlas se, nebo požádej o vstup.',
    });
  }
}
