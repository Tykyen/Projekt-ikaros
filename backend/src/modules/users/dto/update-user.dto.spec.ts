import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateUserDto } from './update-user.dto';
import { RequestUsernameChangeDto } from './request-username-change.dto';
import { RegisterDto } from '../../auth/dto/register.dto';

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

async function errorProps(patch: Record<string, unknown>): Promise<string[]> {
  const dto = plainToInstance(UpdateUserDto, patch);
  const errors = await validate(dto);
  return errors.map((e) => e.property);
}

describe('UpdateUserDto — F-24 (displayName @MaxLength 32)', () => {
  it('F-24 — přijme displayName do 32 znaků', async () => {
    expect(await errorProps({ displayName: 'x'.repeat(32) })).toEqual([]);
  });

  it('F-24 — odmítne displayName nad 32 znaků (33–64 = FE OK, BE 400)', async () => {
    expect(await errorProps({ displayName: 'x'.repeat(33) })).toContain(
      'displayName',
    );
  });

  it('D-NEW-INV-PROFILE — displayName se ořízne (whitespace-only → prázdné)', () => {
    expect(
      plainToInstance(UpdateUserDto, { displayName: '  John  ' }).displayName,
    ).toBe('John');
    expect(
      plainToInstance(UpdateUserDto, { displayName: '   ' }).displayName,
    ).toBe('');
  });
});

describe('UpdateUserDto — F-28 (chatColor strict 6-hex)', () => {
  it('F-28 — přijme úplný 6-znak hex', async () => {
    expect(await errorProps({ chatColor: '#AABBCC' })).toEqual([]);
    expect(await errorProps({ chatColor: '#abc123' })).toEqual([]);
  });

  it('F-28 — odmítne 3-znak shorthand #ABC', async () => {
    expect(await errorProps({ chatColor: '#ABC' })).toContain('chatColor');
  });

  it('F-28 — odmítne osamocený # / neúplný hex', async () => {
    expect(await errorProps({ chatColor: '#' })).toContain('chatColor');
    expect(await errorProps({ chatColor: '#AABB' })).toContain('chatColor');
  });

  it('F-28 — odmítne hex bez #', async () => {
    expect(await errorProps({ chatColor: 'AABBCC' })).toContain('chatColor');
  });
});

/**
 * F-23 — username pravidlo sjednoceno na JEDNO napříč třemi DTO:
 * MinLength(3) + MaxLength(32) + /^[^@]+$/.
 * Dříve `UpdateUserDto.username` (přímý PATCH) postrádal MinLength i Matches,
 * takže `ab` nebo `a@b` prošlo, na rozdíl od registrace / žádosti o změnu.
 */
describe('UpdateUserDto.username — F-23 (sjednocené pravidlo)', () => {
  it('F-23 — přijme validní username (3–32, bez @)', async () => {
    expect(await errorProps({ username: 'hrac-1' })).toEqual([]);
  });

  it('F-23 — odmítne username kratší než 3 znaky', async () => {
    expect(await errorProps({ username: 'ab' })).toContain('username');
  });

  it('F-23 — odmítne username nad 32 znaků', async () => {
    expect(await errorProps({ username: 'x'.repeat(33) })).toContain(
      'username',
    );
  });

  it('F-23 — odmítne username obsahující @', async () => {
    expect(await errorProps({ username: 'a@b' })).toContain('username');
  });

  it('F-23 — username zůstává volitelný (PATCH bez něj projde)', async () => {
    expect(await errorProps({})).toEqual([]);
  });
});

describe('F-23 — pravidla username jsou identická napříč DTO', () => {
  const cases: Array<{ value: string; valid: boolean }> = [
    { value: 'ab', valid: false }, // krátké
    { value: 'a@b', valid: false }, // obsahuje @
    { value: 'x'.repeat(33), valid: false }, // dlouhé
    { value: 'platne-jmeno', valid: true },
  ];

  for (const { value, valid } of cases) {
    it(`F-23 — "${value.slice(0, 12)}" → ${
      valid ? 'OK' : 'reject'
    } ve všech třech DTO`, async () => {
      const reg = (
        await validate(
          plainToInstance(RegisterDto, {
            email: 'a@b.cz',
            username: value,
            password: 'heslo123',
            acceptedTerms: true,
          }),
        )
      ).some((e) => e.property === 'username');
      const req = (
        await validate(
          plainToInstance(RequestUsernameChangeDto, { newUsername: value }),
        )
      ).some((e) => e.property === 'newUsername');
      const upd = (
        await validate(plainToInstance(UpdateUserDto, { username: value }))
      ).some((e) => e.property === 'username');

      // valid → žádná z DTO nehlásí chybu; invalid → všechny tři hlásí chybu.
      expect(reg).toBe(!valid);
      expect(req).toBe(!valid);
      expect(upd).toBe(!valid);
    });
  }
});
