import { IkarosDiscussionsController } from './ikaros-discussions.controller';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

/**
 * D-DROBNE — GET /ikaros-discussions/my: guard přihlášení + pořadí rout.
 * Metadata-only testy (bez DI) — hlídají regresi, kdy by statická routa
 * `my` spadla pod `:id` (lekce `community` před `:id`) nebo endpoint
 * ztratil JwtAuthGuard.
 */
describe('IkarosDiscussionsController — /my', () => {
  it('controller je class-level chráněn JwtAuthGuard (platí i pro GET /my)', () => {
    const guards: unknown[] =
      Reflect.getMetadata('__guards__', IkarosDiscussionsController) ?? [];
    expect(guards).toContain(JwtAuthGuard);
  });

  it('findMy má path `my` a metodu GET', () => {
    const proto = IkarosDiscussionsController.prototype as unknown as Record<
      string,
      () => void
    >;
    expect(Reflect.getMetadata('path', proto.findMy)).toBe('my');
    // RequestMethod.GET === 0 (@nestjs/common enum)
    expect(Reflect.getMetadata('method', proto.findMy)).toBe(0);
  });

  it('routa `my` je deklarovaná PŘED `:id` (jinak ji :id handler pohltí)', () => {
    const methodNames = Object.getOwnPropertyNames(
      IkarosDiscussionsController.prototype,
    );
    const myIdx = methodNames.indexOf('findMy');
    const byIdIdx = methodNames.indexOf('findById');
    expect(myIdx).toBeGreaterThan(-1);
    expect(byIdIdx).toBeGreaterThan(-1);
    expect(myIdx).toBeLessThan(byIdIdx);
  });
});
