import {
  BadRequestException,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import { authenticator } from 'otplib';
import { TotpService } from './totp.service';
import { TotpCryptoService } from './totp-crypto.service';
import { TrustedDevicesService } from '../../trusted-devices/trusted-devices.service';
import type { IUsersRepository } from '../../users/interfaces/users-repository.interface';

jest.mock('bcrypt', () => ({
  hash: jest.fn((s: string) => Promise.resolve(`hash:${s}`)),
  compare: jest.fn(),
}));
import * as bcrypt from 'bcrypt';

describe('TotpService', () => {
  const secret = authenticator.generateSecret();
  const enc = `enc(${secret})`;

  const usersRepo = { findById: jest.fn(), update: jest.fn() };
  const crypto = {
    encryptSecret: jest.fn(() => enc),
    decryptSecret: jest.fn(() => secret),
    isConfigured: true,
  } as unknown as TotpCryptoService;
  const trustedDevices = { revokeAllForUser: jest.fn() };

  let svc: TotpService;
  const baseUser = {
    id: 'u1',
    email: 'a@a.com',
    passwordHash: 'ph',
    totpEnabled: false,
    totpSecretEnc: enc,
    backupCodeHashes: [] as string[],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    svc = new TotpService(
      usersRepo as unknown as IUsersRepository,
      crypto,
      trustedDevices as unknown as TrustedDevicesService,
    );
  });

  describe('enable', () => {
    it('správný kód → aktivuje + 10 záložních kódů', async () => {
      usersRepo.findById.mockResolvedValue({ ...baseUser });
      const res = await svc.enable('u1', authenticator.generate(secret));
      expect(res.backupCodes).toHaveLength(10);
      expect(usersRepo.update).toHaveBeenCalledWith(
        'u1',
        expect.objectContaining({ totpEnabled: true }),
      );
    });

    it('špatný kód → BadRequest', async () => {
      usersRepo.findById.mockResolvedValue({ ...baseUser });
      await expect(svc.enable('u1', '000000')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('už aktivní → Conflict', async () => {
      usersRepo.findById.mockResolvedValue({ ...baseUser, totpEnabled: true });
      await expect(svc.enable('u1', '000000')).rejects.toBeInstanceOf(
        ConflictException,
      );
    });
  });

  describe('verifyForLogin', () => {
    it('platný TOTP kód → true', async () => {
      const user = { ...baseUser, totpEnabled: true };
      expect(
        await svc.verifyForLogin(user as never, authenticator.generate(secret)),
      ).toBe(true);
    });

    it('záložní kód → true a odebere se ze seznamu', async () => {
      (bcrypt.compare as jest.Mock).mockImplementation(
        (code: string, hash: string) =>
          Promise.resolve(hash === `hash:${code}`),
      );
      const user = {
        ...baseUser,
        totpEnabled: true,
        backupCodeHashes: ['hash:abcde12345'],
      };
      expect(await svc.verifyForLogin(user as never, 'abcde12345')).toBe(true);
      expect(usersRepo.update).toHaveBeenCalledWith('u1', {
        backupCodeHashes: [],
      });
    });

    it('špatný kód → false', async () => {
      const user = { ...baseUser, totpEnabled: true };
      expect(await svc.verifyForLogin(user as never, '111111')).toBe(false);
    });
  });

  describe('disable', () => {
    it('správné heslo → vypne + revokuje trust', async () => {
      usersRepo.findById.mockResolvedValue({ ...baseUser, totpEnabled: true });
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      await svc.disable('u1', 'pw');
      expect(usersRepo.update).toHaveBeenCalledWith(
        'u1',
        expect.objectContaining({ totpEnabled: false, totpSecretEnc: null }),
      );
      expect(trustedDevices.revokeAllForUser).toHaveBeenCalledWith('u1');
    });

    it('špatné heslo → Unauthorized', async () => {
      usersRepo.findById.mockResolvedValue({ ...baseUser, totpEnabled: true });
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);
      await expect(svc.disable('u1', 'bad')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });
  });
});
