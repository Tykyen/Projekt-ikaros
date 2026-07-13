import {
  makePjPersonaResolver,
  resolvePjPersona,
  type PjPersonaConfig,
  type PjPersonaMember,
} from './pj-persona.util';
import { WorldRole } from './interfaces/world-membership.interface';

/**
 * D-NEW-INV-SEC „persona-on-server" — BE resolver musí zrcadlit FE
 * (`FE: src/features/world/chat/lib/pjPersona.spec.ts`), jinak hráč uvidí
 * v push/feedu/exportu jiné jméno než ve world chatu.
 */
const members: PjPersonaMember[] = [
  { userId: 'pj', role: WorldRole.PJ, pjPersonaAvatarUrl: 'pj.png' },
  { userId: 'asst', role: WorldRole.PomocnyPJ },
  { userId: 'hrac', role: WorldRole.Hrac },
];

const persona = (over: Partial<NonNullable<PjPersonaConfig>> = {}) => ({
  enabled: true,
  name: null,
  avatarUrl: null,
  mode: 'unified' as const,
  ...over,
});

describe('makePjPersonaResolver (BE zrcadlo FE pjPersona)', () => {
  it('unified → sdílené „PJ" pro vedení, null pro hráče', () => {
    const r = makePjPersonaResolver(
      members,
      persona({ avatarUrl: 'shared.png' }),
    );
    expect(r('pj')).toEqual({ name: 'PJ', avatarUrl: 'shared.png' });
    expect(r('asst')).toEqual({ name: 'PJ', avatarUrl: 'shared.png' });
    expect(r('hrac')).toBeNull();
  });

  it('unified s vlastním jménem persony → nese jméno persony', () => {
    const r = makePjPersonaResolver(members, persona({ name: 'Vypravěč' }));
    expect(r('pj')).toEqual({ name: 'Vypravěč', avatarUrl: null });
  });

  it('unified bez persony (null/undefined) → default „PJ"', () => {
    expect(makePjPersonaResolver(members, undefined)('pj')).toEqual({
      name: 'PJ',
      avatarUrl: null,
    });
    expect(makePjPersonaResolver(members, null)('asst')).toEqual({
      name: 'PJ',
      avatarUrl: null,
    });
  });

  it('unified s prázdným/whitespace jménem → fallback „PJ"', () => {
    const r = makePjPersonaResolver(members, persona({ name: '   ' }));
    expect(r('pj')?.name).toBe('PJ');
  });

  it('individual → per-člen role label + vlastní avatar', () => {
    const r = makePjPersonaResolver(members, persona({ mode: 'individual' }));
    expect(r('pj')).toEqual({ name: 'PJ', avatarUrl: 'pj.png' });
    // asst nemá pjPersonaAvatarUrl → null (fallback řeší konzument)
    expect(r('asst')).toEqual({ name: 'Pomocný PJ', avatarUrl: null });
    expect(r('hrac')).toBeNull();
  });

  it('chybějící mode (stará data) → chová se jako unified', () => {
    const r = makePjPersonaResolver(members, {
      name: 'Kronikář',
      avatarUrl: null,
    });
    expect(r('asst')).toEqual({ name: 'Kronikář', avatarUrl: null });
  });

  it('žádné vedení → vždy null', () => {
    const r = makePjPersonaResolver(
      [{ userId: 'h', role: WorldRole.Hrac }],
      persona(),
    );
    expect(r('h')).toBeNull();
  });
});

describe('resolvePjPersona (single-shot)', () => {
  it('vedení → persona, hráč/null member → null', () => {
    expect(
      resolvePjPersona(
        { userId: 'pj', role: WorldRole.PJ },
        persona({ name: 'Mistr hry' }),
      ),
    ).toEqual({ name: 'Mistr hry', avatarUrl: null });
    expect(
      resolvePjPersona({ userId: 'h', role: WorldRole.Hrac }, persona()),
    ).toBeNull();
    expect(resolvePjPersona(null, persona())).toBeNull();
  });
});
