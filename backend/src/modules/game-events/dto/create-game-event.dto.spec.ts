import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateGameEventDto } from './create-game-event.dto';

/** Validní základ — focal pole se testují nad ním. */
const base = {
  worldId: 'w1',
  title: 'Sezení',
  date: '2026-06-15T18:00',
};

async function errorProps(patch: Record<string, unknown>): Promise<string[]> {
  const dto = plainToInstance(CreateGameEventDto, { ...base, ...patch });
  const errors = await validate(dto);
  return errors.map((e) => e.property);
}

describe('CreateGameEventDto — F-08 (cross-field groupOnly ↔ targetGroup)', () => {
  it('F-08 — přijme groupOnly:true s neprázdným targetGroup', async () => {
    expect(
      await errorProps({ groupOnly: true, targetGroup: 'druzina-a' }),
    ).toEqual([]);
  });

  it('F-08 — přijme groupOnly:false bez targetGroup', async () => {
    expect(await errorProps({ groupOnly: false })).toEqual([]);
  });

  it('F-08 — odmítne groupOnly:true s prázdným targetGroup', async () => {
    expect(await errorProps({ groupOnly: true, targetGroup: '' })).toContain(
      'targetGroup',
    );
  });

  // AR-13 fix (dříve F-08 GAP): `@IsOptional()` odebrán, takže `@ValidateIf`
  // řídí validaci. `{ groupOnly: true, targetGroup: null }` teď SPRÁVNĚ neprojde
  // (FE posílá null → dřív tichá díra v cílení akce). Regresní guard.
  it('AR-13 — odmítne groupOnly:true s targetGroup null', async () => {
    expect(await errorProps({ groupOnly: true, targetGroup: null })).toContain(
      'targetGroup',
    );
  });
});

describe('CreateGameEventDto — F-13 (targetGroup @MaxLength 64)', () => {
  it('F-13 — přijme targetGroup do 64 znaků', async () => {
    expect(
      await errorProps({ groupOnly: true, targetGroup: 'x'.repeat(64) }),
    ).toEqual([]);
  });

  it('F-13 — odmítne targetGroup nad 64 znaků', async () => {
    expect(
      await errorProps({ groupOnly: true, targetGroup: 'x'.repeat(65) }),
    ).toContain('targetGroup');
  });
});
