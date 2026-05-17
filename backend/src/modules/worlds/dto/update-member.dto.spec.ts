import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateMemberRoleDto } from './update-member.dto';

/**
 * Krok 5.3 — DTO bylo neaktualizované po migraci D-053 (staré číslování
 * -1..3). Test hlídá, že platné role 0–5 projdou a staré/neplatné padnou.
 */
describe('UpdateMemberRoleDto', () => {
  async function check(role: unknown) {
    const dto = plainToInstance(UpdateMemberRoleDto, { role });
    return validate(dto);
  }

  it('role 4 (PomocnyPJ) projde', async () => {
    expect(await check(4)).toHaveLength(0);
  });

  it('role 5 (PJ) projde', async () => {
    expect(await check(5)).toHaveLength(0);
  });

  it('legacy role -1 je odmítnuta', async () => {
    expect(await check(-1)).not.toHaveLength(0);
  });

  it('role mimo rozsah (6) je odmítnuta', async () => {
    expect(await check(6)).not.toHaveLength(0);
  });
});
