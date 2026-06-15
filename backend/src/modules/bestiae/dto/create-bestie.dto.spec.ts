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

describe('CreateBestieDto — F-20 (abilities[] @ValidateNested)', () => {
  it('F-20 — přijme validní abilities {label,value}', async () => {
    expect(
      await errorProps({
        abilities: [{ label: 'Síla', value: '18' }],
      }),
    ).toEqual([]);
  });

  it('F-20 — odmítne prvek bez label/value (číslo místo objektu)', async () => {
    // Bez @ValidateNested by nevalidovaný prvek prošel.
    expect(await errorProps({ abilities: [123] })).toContain('abilities');
  });

  it('F-20 — odmítne prvek s label/value nesprávného typu', async () => {
    expect(
      await errorProps({ abilities: [{ label: 5, value: true }] }),
    ).toContain('abilities');
  });

  it('F-20 — odmítne label nad 200 / value nad 2000 znaků', async () => {
    expect(
      await errorProps({
        abilities: [{ label: 'x'.repeat(201), value: 'ok' }],
      }),
    ).toContain('abilities');
    expect(
      await errorProps({
        abilities: [{ label: 'ok', value: 'x'.repeat(2001) }],
      }),
    ).toContain('abilities');
  });
});
