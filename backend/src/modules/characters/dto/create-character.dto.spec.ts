import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateCharacterDto } from './create-character.dto';

/** Validní základ — name se testuje nad ním. */
const base = { slug: 'aragorn', name: 'Aragorn', isNpc: false };

async function errorProps(patch: Record<string, unknown>): Promise<string[]> {
  const dto = plainToInstance(CreateCharacterDto, { ...base, ...patch });
  const errors = await validate(dto);
  return errors.map((e) => e.property);
}

describe('CreateCharacterDto — F-16 (name @MaxLength 200)', () => {
  it('F-16 — přijme name do 200 znaků', async () => {
    expect(await errorProps({ name: 'x'.repeat(200) })).toEqual([]);
  });

  it('F-16 — odmítne name nad 200 znaků', async () => {
    expect(await errorProps({ name: 'x'.repeat(201) })).toContain('name');
  });
});
