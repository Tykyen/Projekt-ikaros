import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateWorldDto } from './update-world.dto';

async function errorProps(patch: Record<string, unknown>): Promise<string[]> {
  const dto = plainToInstance(UpdateWorldDto, patch);
  const errors = await validate(dto);
  return errors.map((e) => e.property);
}

describe('UpdateWorldDto — F-05 (délkové limity)', () => {
  it('F-05 — přijme validní hodnoty', async () => {
    expect(
      await errorProps({
        name: 'Svět',
        description: 'popis',
        playersWanted: 'hledám 2 hráče',
      }),
    ).toEqual([]);
  });

  it('F-05 — odmítne name nad 60 znaků', async () => {
    expect(await errorProps({ name: 'x'.repeat(61) })).toContain('name');
  });

  it('F-05 — odmítne description nad 1000 znaků', async () => {
    expect(await errorProps({ description: 'x'.repeat(1001) })).toContain(
      'description',
    );
  });

  it('F-05 — odmítne playersWanted nad 500 znaků', async () => {
    expect(await errorProps({ playersWanted: 'x'.repeat(501) })).toContain(
      'playersWanted',
    );
  });
});

describe('UpdateWorldDto — F-07 (imageUrl clear)', () => {
  it("F-07 — přijme prázdný řetězec '' (clear titulky)", async () => {
    expect(await errorProps({ imageUrl: '' })).not.toContain('imageUrl');
  });

  it('F-07 — přijme null (clear titulky)', async () => {
    expect(await errorProps({ imageUrl: null })).not.toContain('imageUrl');
  });

  it('F-07 — přijme platnou URL', async () => {
    expect(
      await errorProps({ imageUrl: 'https://example.com/img.png' }),
    ).not.toContain('imageUrl');
  });

  it('F-07 — odmítne neprázdnou nevalidní URL', async () => {
    expect(await errorProps({ imageUrl: 'not a url' })).toContain('imageUrl');
  });
});
