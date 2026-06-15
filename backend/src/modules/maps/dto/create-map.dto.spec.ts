import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateMapDto } from './create-map.dto';

async function configErrors(
  config: Record<string, unknown>,
): Promise<string[]> {
  const dto = plainToInstance(CreateMapDto, { config });
  const errors = await validate(dto);
  // Sesbírej i nested chyby pod `config`.
  const props: string[] = [];
  for (const e of errors) {
    props.push(e.property);
    for (const child of e.children ?? []) props.push(child.property);
  }
  return props;
}

describe('CreateMapDto — F-21 (config.size/originX/originY @IsNumber)', () => {
  it('F-21 — přijme číselné size/originX/originY', async () => {
    expect(
      await configErrors({
        size: 64,
        originX: 10,
        originY: -5,
        showGrid: true,
      }),
    ).toEqual([]);
  });

  it('F-21 — přijme prázdný config (vše volitelné)', async () => {
    expect(await configErrors({})).toEqual([]);
  });

  it('F-21 — odmítne string místo čísla u size', async () => {
    expect(await configErrors({ size: '64' })).toContain('size');
  });

  it('F-21 — odmítne string u originX a originY', async () => {
    expect(await configErrors({ originX: 'a' })).toContain('originX');
    expect(await configErrors({ originY: 'b' })).toContain('originY');
  });
});
