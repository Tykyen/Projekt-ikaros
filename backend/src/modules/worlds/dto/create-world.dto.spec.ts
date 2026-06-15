import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateWorldDto } from './create-world.dto';

/** Validní základ — slug se testuje nad ním. */
const base = { name: 'Můj svět', slug: 'muj-svet' };

async function errorProps(patch: Record<string, unknown>): Promise<string[]> {
  const dto = plainToInstance(CreateWorldDto, { ...base, ...patch });
  const errors = await validate(dto);
  return errors.map((e) => e.property);
}

describe('CreateWorldDto — F-06 (slug @Matches kebab-case)', () => {
  it('F-06 — přijme validní kebab-case slug', async () => {
    expect(await errorProps({ slug: 'muj-svet-2' })).toEqual([]);
  });

  it('F-06 — odmítne slug s mezerou', async () => {
    expect(await errorProps({ slug: 'Foo Bar' })).toContain('slug');
  });

  it('F-06 — odmítne slug s velkými písmeny', async () => {
    expect(await errorProps({ slug: 'MujSvet' })).toContain('slug');
  });

  it('F-06 — odmítne slug s podtržítkem / speciálními znaky', async () => {
    expect(await errorProps({ slug: 'muj_svet' })).toContain('slug');
    expect(await errorProps({ slug: 'muj@svet' })).toContain('slug');
  });
});
