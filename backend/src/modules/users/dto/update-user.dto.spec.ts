import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateUserDto } from './update-user.dto';

/**
 * N-11 — `themeId` musí být validován proti seznamu platných motivů
 * (`THEME_IDS`), jinak by ValidationPipe pustila libovolný string do DB.
 */
describe('UpdateUserDto — themeId validace (N-11)', () => {
  async function check(plain: Record<string, unknown>) {
    const dto = plainToInstance(UpdateUserDto, plain);
    const errors = await validate(dto);
    return errors;
  }

  it('platný motiv projde', async () => {
    expect(await check({ themeId: 'magie' })).toHaveLength(0);
  });

  it('platný světový motiv projde', async () => {
    expect(await check({ themeId: 'ikaros' })).toHaveLength(0);
  });

  it('neexistující motiv je odmítnut', async () => {
    const errors = await check({ themeId: 'neexistuje-xyz' });
    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('themeId');
  });

  it('prázdný/chybějící themeId je validní (optional)', async () => {
    expect(await check({})).toHaveLength(0);
  });
});
