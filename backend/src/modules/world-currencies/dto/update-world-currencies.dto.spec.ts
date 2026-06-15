import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { WorldCurrencyItemDto } from './update-world-currencies.dto';

/** Validní základ — focal pole se testují nad ním. */
const base = { code: 'GP', name: 'Zlaťák', symbol: 'g', rate: 1 };

async function errorProps(patch: Record<string, unknown>): Promise<string[]> {
  const dto = plainToInstance(WorldCurrencyItemDto, { ...base, ...patch });
  const errors = await validate(dto);
  return errors.map((e) => e.property);
}

describe('WorldCurrencyItemDto — F-04', () => {
  it('F-04 — přijme validní měnu', async () => {
    expect(await errorProps({})).toEqual([]);
  });

  it('F-04 — odmítne code nad 8 znaků / mimo regex', async () => {
    expect(await errorProps({ code: 'ABCDEFGHI' })).toContain('code'); // 9 znaků
    expect(await errorProps({ code: 'gp' })).toContain('code'); // malá písmena
    expect(await errorProps({ code: 'G P' })).toContain('code'); // mezera
  });

  it('F-04 — odmítne name nad 40 znaků a prázdné', async () => {
    expect(await errorProps({ name: 'x'.repeat(41) })).toContain('name');
    expect(await errorProps({ name: '' })).toContain('name');
  });

  it('F-04 — odmítne symbol nad 8 znaků', async () => {
    expect(await errorProps({ symbol: 'x'.repeat(9) })).toContain('symbol');
  });

  it('F-04 — odmítne rate mimo rozsah (0.0001–1000000)', async () => {
    expect(await errorProps({ rate: 0 })).toContain('rate');
    expect(await errorProps({ rate: 1000001 })).toContain('rate');
  });
});
