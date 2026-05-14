import { Test } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { SecurityTokensService } from './security-tokens.service';
import type {
  CreateSecurityTokenInput,
  ISecurityTokensRepository,
} from './interfaces/security-tokens-repository.interface';
import type {
  SecurityToken,
  SecurityTokenType,
} from './interfaces/security-token.interface';

class InMemoryRepo implements ISecurityTokensRepository {
  private next = 1;
  records: SecurityToken[] = [];

  save(input: CreateSecurityTokenInput): Promise<SecurityToken> {
    const rec: SecurityToken = {
      id: `t${this.next++}`,
      type: input.type,
      userId: input.userId,
      tokenHash: input.tokenHash,
      expiresAt: input.expiresAt,
      meta: input.meta,
      createdAt: new Date(),
    };
    this.records.push(rec);
    return Promise.resolve(rec);
  }
  findByHash(tokenHash: string): Promise<SecurityToken | null> {
    return Promise.resolve(
      this.records.find((r) => r.tokenHash === tokenHash) ?? null,
    );
  }
  markUsed(id: string, usedAt: Date): Promise<void> {
    const r = this.records.find((x) => x.id === id);
    if (r) r.usedAt = usedAt;
    return Promise.resolve();
  }
  invalidateAllByUserAndType(
    userId: string,
    type: SecurityTokenType,
  ): Promise<void> {
    for (const r of this.records) {
      if (r.userId === userId && r.type === type && !r.usedAt) {
        r.usedAt = new Date();
      }
    }
    return Promise.resolve();
  }
}

describe('SecurityTokensService (1.7)', () => {
  let service: SecurityTokensService;
  let repo: InMemoryRepo;

  beforeEach(async () => {
    repo = new InMemoryRepo();
    const mod = await Test.createTestingModule({
      providers: [
        SecurityTokensService,
        { provide: 'ISecurityTokensRepository', useValue: repo },
      ],
    }).compile();
    service = mod.get(SecurityTokensService);
  });

  describe('issue + consume happy path', () => {
    it('vrací 64-znakový hex token (32 bytes)', async () => {
      const tok = await service.issue('u1', 'password_reset', 60_000);
      expect(tok).toMatch(/^[a-f0-9]{64}$/);
    });

    it('v DB se uloží jen sha256 hash, ne plain', async () => {
      const tok = await service.issue('u1', 'password_reset', 60_000);
      expect(repo.records[0].tokenHash).toBe(service.hash(tok));
      expect(repo.records[0].tokenHash).not.toBe(tok);
    });

    it('consume vrací userId + meta', async () => {
      const tok = await service.issue('u1', 'email_change', 60_000, {
        newEmail: 'new@x.cz',
      });
      const out = await service.consume(tok, 'email_change');
      expect(out.userId).toBe('u1');
      expect(out.meta?.newEmail).toBe('new@x.cz');
    });

    it('consume markuje usedAt', async () => {
      const tok = await service.issue('u1', 'email_verify', 60_000);
      await service.consume(tok, 'email_verify');
      const r = repo.records.find((x) => !x.usedAt);
      expect(r).toBeUndefined();
    });
  });

  describe('issue invalidate předchozí tokeny stejného typu', () => {
    it('starý token stejného typu → 400 ALREADY_USED při consume', async () => {
      const old = await service.issue('u1', 'password_reset', 60_000);
      await service.issue('u1', 'password_reset', 60_000); // invaliduje starý
      await expect(service.consume(old, 'password_reset')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('jiný type usera nezasahuje', async () => {
      const verify = await service.issue('u1', 'email_verify', 60_000);
      await service.issue('u1', 'password_reset', 60_000); // jiný type
      const out = await service.consume(verify, 'email_verify');
      expect(out.userId).toBe('u1');
    });
  });

  describe('consume edge cases', () => {
    it('neznámý token → 400 INVALID_TOKEN', async () => {
      await expect(
        service.consume('a'.repeat(64), 'password_reset'),
      ).rejects.toMatchObject({ response: { code: 'INVALID_TOKEN' } });
    });

    it('wrong type → 400 INVALID_TOKEN', async () => {
      const tok = await service.issue('u1', 'password_reset', 60_000);
      await expect(service.consume(tok, 'email_change')).rejects.toMatchObject({
        response: { code: 'INVALID_TOKEN' },
      });
    });

    it('expired token → 400 EXPIRED_TOKEN', async () => {
      const tok = await service.issue('u1', 'password_reset', -1000); // expired okamžitě
      await expect(
        service.consume(tok, 'password_reset'),
      ).rejects.toMatchObject({ response: { code: 'EXPIRED_TOKEN' } });
    });

    it('already used → 400 ALREADY_USED', async () => {
      const tok = await service.issue('u1', 'password_reset', 60_000);
      await service.consume(tok, 'password_reset');
      await expect(
        service.consume(tok, 'password_reset'),
      ).rejects.toMatchObject({ response: { code: 'ALREADY_USED' } });
    });

    it('prázdný/non-string token → 400 INVALID_TOKEN', async () => {
      await expect(service.consume('', 'password_reset')).rejects.toMatchObject(
        { response: { code: 'INVALID_TOKEN' } },
      );
      await expect(
        service.consume(undefined as unknown as string, 'password_reset'),
      ).rejects.toMatchObject({ response: { code: 'INVALID_TOKEN' } });
    });
  });

  describe('hash je deterministický', () => {
    it('stejný plain → stejný hash', () => {
      expect(service.hash('abc')).toBe(service.hash('abc'));
    });

    it('různý plain → různý hash', () => {
      expect(service.hash('abc')).not.toBe(service.hash('abcd'));
    });
  });

  it('random tokeny mají vysoký entropy (žádné duplikáty v 100 issue)', async () => {
    const tokens = new Set<string>();
    for (let i = 0; i < 100; i++) {
      tokens.add(await service.issue(`u${i}`, 'password_reset', 60_000));
    }
    expect(tokens.size).toBe(100);
  });
});
