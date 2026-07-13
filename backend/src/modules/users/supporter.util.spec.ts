import { UserRole } from './interfaces/user.interface';
import { isEffectiveSupporter } from './supporter.util';

describe('isEffectiveSupporter (19.4)', () => {
  it('flag isSupporter=true → efektivní podporovatel bez ohledu na roli', () => {
    expect(isEffectiveSupporter(UserRole.Ikarus, true)).toBe(true);
  });

  it('běžný uživatel (Ikarus) bez flagu → NENÍ podporovatel', () => {
    expect(isEffectiveSupporter(UserRole.Ikarus, false)).toBe(false);
    expect(isEffectiveSupporter(UserRole.Ikarus, undefined)).toBe(false);
  });

  it('tým (Admin/Superadmin/Správci) → podporovatel automaticky z role', () => {
    expect(isEffectiveSupporter(UserRole.Superadmin)).toBe(true);
    expect(isEffectiveSupporter(UserRole.Admin)).toBe(true);
    expect(isEffectiveSupporter(UserRole.SpravceClanku)).toBe(true);
    expect(isEffectiveSupporter(UserRole.SpravceGalerie)).toBe(true);
    expect(isEffectiveSupporter(UserRole.SpravceDiskuzi)).toBe(true);
  });

  it('role bez privilegií (Hrac) bez flagu → NENÍ podporovatel', () => {
    expect(isEffectiveSupporter(UserRole.Hrac, false)).toBe(false);
  });
});
