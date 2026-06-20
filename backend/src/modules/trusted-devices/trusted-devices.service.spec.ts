import { TrustedDevicesService } from './trusted-devices.service';

describe('TrustedDevicesService', () => {
  const repo = {
    save: jest.fn(),
    findByTokenHash: jest.fn(),
    findByUserId: jest.fn(),
    touch: jest.fn(),
    deleteById: jest.fn(),
    deleteAllForUser: jest.fn(),
  };
  let svc: TrustedDevicesService;

  beforeEach(() => {
    jest.clearAllMocks();
    svc = new TrustedDevicesService(repo);
  });

  describe('match', () => {
    it('bez tokenu → null', async () => {
      expect(await svc.match(undefined, 'u1')).toBeNull();
      expect(repo.findByTokenHash).not.toHaveBeenCalled();
    });

    it('platné zařízení → vrátí', async () => {
      repo.findByTokenHash.mockResolvedValue({
        id: 'd1',
        userId: 'u1',
        expiresAt: new Date(Date.now() + 10_000),
      });
      expect(await svc.match('tok', 'u1')).toMatchObject({ id: 'd1' });
    });

    it('zařízení jiného usera → null (anti-IDOR)', async () => {
      repo.findByTokenHash.mockResolvedValue({
        id: 'd1',
        userId: 'u2',
        expiresAt: new Date(Date.now() + 10_000),
      });
      expect(await svc.match('tok', 'u1')).toBeNull();
    });

    it('expirované zařízení → null', async () => {
      repo.findByTokenHash.mockResolvedValue({
        id: 'd1',
        userId: 'u1',
        expiresAt: new Date(Date.now() - 1_000),
      });
      expect(await svc.match('tok', 'u1')).toBeNull();
    });
  });

  describe('createForUser', () => {
    it('uloží hash (ne plaintext), vrátí plain token + label z UA', async () => {
      const token = await svc.createForUser(
        'u1',
        'Mozilla/5.0 (Windows NT 10.0) Chrome/120',
      );
      expect(typeof token).toBe('string');
      const saved = repo.save.mock.calls[0][0];
      expect(saved.userId).toBe('u1');
      expect(saved.label).toContain('Chrome');
      expect(saved.label).toContain('Windows');
      expect(saved.tokenHash).not.toBe(token); // v DB jen hash
    });
  });

  describe('handlePasswordChanged', () => {
    it('revokuje všechna zařízení usera', async () => {
      await svc.handlePasswordChanged({ userId: 'u1' });
      expect(repo.deleteAllForUser).toHaveBeenCalledWith('u1');
    });
  });

  // CD-RUN-3 — hard-delete účtu uklidí důvěryhodná zařízení (orphan cleanup).
  describe('handleAccountHardDeleted', () => {
    it('revokuje všechna zařízení smazaného účtu', async () => {
      await svc.handleAccountHardDeleted({ userId: 'u1' });
      expect(repo.deleteAllForUser).toHaveBeenCalledWith('u1');
    });
  });

  describe('list', () => {
    it('bez aktuálního tokenu → current=false', async () => {
      repo.findByUserId.mockResolvedValue([
        {
          id: 'd1',
          label: 'Chrome · Windows',
          lastUsedAt: new Date(),
          createdAt: new Date(),
          tokenHash: 'h1',
        },
      ]);
      const res = await svc.list('u1');
      expect(res[0]).toMatchObject({ id: 'd1', current: false });
      expect(res[0]).not.toHaveProperty('tokenHash');
    });
  });
});
