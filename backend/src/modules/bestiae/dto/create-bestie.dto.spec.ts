import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateBestieDto } from './create-bestie.dto';

/** Validní základ — imageUrl se testuje nad ním. */
const base = {
  scope: 'world',
  systemId: 'dnd5e',
  name: 'Goblin',
  systemStats: {},
};

async function errorProps(patch: Record<string, unknown>): Promise<string[]> {
  const dto = plainToInstance(CreateBestieDto, { ...base, ...patch });
  const errors = await validate(dto);
  return errors.map((e) => e.property);
}

describe('CreateBestieDto — F-09 (imageUrl @MaxLength 2048)', () => {
  it('F-09 — přijme imageUrl do 2048 znaků', async () => {
    expect(await errorProps({ imageUrl: 'x'.repeat(2048) })).toEqual([]);
  });

  it('F-09 — přijme bez imageUrl (volitelné)', async () => {
    expect(await errorProps({})).toEqual([]);
  });

  it('F-09 — odmítne imageUrl nad 2048 znaků', async () => {
    expect(await errorProps({ imageUrl: 'x'.repeat(2049) })).toContain(
      'imageUrl',
    );
  });
});

describe('CreateBestieDto — F-20 (top-level `abilities` zrušeno, žije v systemStats)', () => {
  // F-20 (form-schema audit): původně `abilities[]` `@IsArray` BEZ
  // `@ValidateNested` → prvky `{label,value}` nevalidované (red-team). Pole
  // top-level ZRUŠENO (D-NEW-BESTIE-ABILITIES-DUP); schopnosti jsou v
  // `systemStats.abilities` (per-system schéma, validované per systém).
  // Tenhle blok je cílená pojistka F-20 (anti-regression-map guard).
  it('F-20 — top-level `abilities` NENÍ validované pole DTO (kdyby se vrátilo, canary spadne)', async () => {
    // Kdyby někdo znovu přidal `@IsArray() abilities`, tenhle string vstup by
    // vygeneroval validační chybu property `abilities` → test spadne → nutí
    // re-review F-20 (doplnit `@ValidateNested` + `@Type`). Dnes pole neexistuje
    // → žádná chyba `abilities` → schopnosti chodí jen přes systemStats.
    const dto = plainToInstance(CreateBestieDto, {
      ...base,
      abilities: 'not-an-array',
    });
    const errors = await validate(dto);
    expect(errors.map((e) => e.property)).not.toContain('abilities');
  });

  it('F-20 — schopnosti procházejí validně přes `systemStats.abilities`', async () => {
    expect(
      await errorProps({
        systemStats: { abilities: [{ label: 'Drápy', value: '2k6' }] },
      }),
    ).toEqual([]);
  });
});
