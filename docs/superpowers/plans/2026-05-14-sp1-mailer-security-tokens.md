# SP1 — Mailer + SecurityTokens Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dodat dvě sdílené `@Global()` infrastrukturní moduly: `SecurityTokensModule` (atomic token issue/consume s SHA-256 hash + Mongo TTL) a `MailerModule` (interface + LogMailerProvider dev backend), které SP2 (Auth email flows), SP3 (UsersService) a SP4 (Admin) budou injectovat.

**Architecture:** Mongoose repository pattern (analog k `RefreshTokenRepository`), token stored jen jako SHA-256 hash, `findOneAndDelete` pro atomic consume. Mailer dispatch wrapper kolem `IMailerProvider` interface, swallows errors do log (nikdy nebreaké caller flow). Oba moduly `@Global()` v `app.module.ts`.

**Tech Stack:** NestJS, Mongoose, Node `crypto` (built-in, žádná nová dependency), Jest s mock Model pattern.

**Spec:** [2026-05-14-sp1-mailer-security-tokens-design](../specs/2026-05-14-sp1-mailer-security-tokens-design.md)

---

## File Structure

**Create — SecurityTokens (7 souborů):**
- `backend/src/modules/security-tokens/interfaces/security-token.interface.ts` — types + ConsumedToken
- `backend/src/modules/security-tokens/interfaces/security-tokens-repository.interface.ts` — `ISecurityTokensRepository`
- `backend/src/modules/security-tokens/schemas/security-token.schema.ts` — Mongoose schema s TTL index
- `backend/src/modules/security-tokens/repositories/security-tokens.repository.ts` — Mongo impl
- `backend/src/modules/security-tokens/repositories/security-tokens.repository.spec.ts` — mock model tests
- `backend/src/modules/security-tokens/security-tokens.service.ts` — issue/consume/hash/revokeAllForUser
- `backend/src/modules/security-tokens/security-tokens.module.ts` — `@Global()`

**Modify — SecurityTokens:**
- `backend/src/modules/security-tokens/security-tokens.service.spec.ts` — **už existuje**, podle něj píšeme service (musíme přizpůsobit zachovaný spec)

**Create — Mailer (5 souborů):**
- `backend/src/modules/mailer/interfaces/mailer-provider.interface.ts` — `IMailerProvider`, types
- `backend/src/modules/mailer/providers/log-mailer.provider.ts` — dev Logger backend
- `backend/src/modules/mailer/providers/log-mailer.provider.spec.ts` — sanity test
- `backend/src/modules/mailer/mailer.service.ts` — 6 metod + dispatch
- `backend/src/modules/mailer/mailer.service.spec.ts` — provider mock tests
- `backend/src/modules/mailer/mailer.module.ts` — `@Global()`

**Modify:**
- `backend/src/app.module.ts` — import `SecurityTokensModule` + `MailerModule`
- `backend/tsconfig.json` — odebrat `security-tokens.service.spec.ts` z exclude
- `backend/eslint.config.mjs` — synchronizovat ignores
- `docs/dluhy.md` — odškrtnout SP1 v master entry

---

## Pre-Task: Inspect existing security-tokens.service.spec.ts

Před implementací service mám pochopit, co existující spec očekává. Tento file je v SP0 tsconfig exclude (právě proto, že modul neexistuje); součástí SP1 je ho **odzvládnout** = service projde jeho 1.7 testy.

- [ ] **Step 0: Načíst existující spec**

Run: `Read backend/src/modules/security-tokens/security-tokens.service.spec.ts` (pokud existuje)

⚠️ **Možnost A:** spec existuje (původně psaný ke ztracenému kódu) → service musí matchnout.
**Možnost B:** spec neexistuje → vytvoříme nový v Task 4 podle 4.1 ve spec docu.

V obou případech, Task 4 napíše service tak, aby projde existujícím i nově přidaným testům.

---

## Task 1: SecurityToken types + interfaces

**Files:**
- Create: `backend/src/modules/security-tokens/interfaces/security-token.interface.ts`
- Create: `backend/src/modules/security-tokens/interfaces/security-tokens-repository.interface.ts`

- [ ] **Step 1: Vytvořit `security-token.interface.ts`**

```typescript
export type SecurityTokenType = 'password_reset' | 'email_verify' | 'email_change';

export interface SecurityToken {
  tokenHash: string;
  userId: string;
  type: SecurityTokenType;
  meta?: Record<string, unknown>;
  expiresAt: Date;
  createdAt: Date;
}

export interface ConsumedToken {
  userId: string;
  meta?: Record<string, unknown>;
}
```

- [ ] **Step 2: Vytvořit `security-tokens-repository.interface.ts`**

```typescript
import type {
  SecurityToken,
  ConsumedToken,
  SecurityTokenType,
} from './security-token.interface';

export interface ISecurityTokensRepository {
  save(token: Omit<SecurityToken, 'createdAt'>): Promise<void>;
  consumeByHash(tokenHash: string, now: Date): Promise<ConsumedToken | null>;
  revokeAllForUser(userId: string, type?: SecurityTokenType): Promise<void>;
}
```

- [ ] **Step 3: Verify typecheck**

Run: `cd backend && npm run typecheck`
Expected: 0 errors.

---

## Task 2: SecurityToken Mongoose schema

**Files:**
- Create: `backend/src/modules/security-tokens/schemas/security-token.schema.ts`

- [ ] **Step 1: Vytvořit schema**

```typescript
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import type { SecurityTokenType } from '../interfaces/security-token.interface';

export type SecurityTokenDocument = HydratedDocument<SecurityTokenSchemaClass>;

@Schema({
  timestamps: { createdAt: true, updatedAt: false },
  collection: 'security_tokens',
})
export class SecurityTokenSchemaClass {
  @Prop({ required: true, unique: true, index: true }) tokenHash: string;
  @Prop({ required: true, index: true }) userId: string;
  @Prop({ required: true, type: String }) type: SecurityTokenType;
  @Prop({ type: Object }) meta?: Record<string, unknown>;
  @Prop({ required: true, type: Date }) expiresAt: Date;
}

export const SecurityTokenSchema = SchemaFactory.createForClass(
  SecurityTokenSchemaClass,
);

// TTL index — MongoDB auto-deletuje doc když current > expiresAt.
SecurityTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
```

- [ ] **Step 2: Verify typecheck**

Run: `cd backend && npm run typecheck`
Expected: 0 errors.

---

## Task 3: Mongo repository + tests

**Files:**
- Create: `backend/src/modules/security-tokens/repositories/security-tokens.repository.ts`
- Create: `backend/src/modules/security-tokens/repositories/security-tokens.repository.spec.ts`

- [ ] **Step 1: Vytvořit repository impl**

```typescript
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { SecurityTokenSchemaClass } from '../schemas/security-token.schema';
import type { ISecurityTokensRepository } from '../interfaces/security-tokens-repository.interface';
import type {
  SecurityToken,
  ConsumedToken,
  SecurityTokenType,
} from '../interfaces/security-token.interface';

@Injectable()
export class MongoSecurityTokensRepository
  implements ISecurityTokensRepository
{
  constructor(
    @InjectModel(SecurityTokenSchemaClass.name)
    private readonly model: Model<SecurityTokenSchemaClass>,
  ) {}

  async save(token: Omit<SecurityToken, 'createdAt'>): Promise<void> {
    await this.model.create(token);
  }

  async consumeByHash(
    tokenHash: string,
    now: Date,
  ): Promise<ConsumedToken | null> {
    const doc = await this.model
      .findOneAndDelete({
        tokenHash,
        expiresAt: { $gt: now },
      })
      .lean()
      .exec();
    if (!doc) return null;
    return {
      userId: doc.userId,
      meta: doc.meta,
    };
  }

  async revokeAllForUser(
    userId: string,
    type?: SecurityTokenType,
  ): Promise<void> {
    const filter: Record<string, unknown> = { userId };
    if (type) filter.type = type;
    await this.model.deleteMany(filter).exec();
  }
}
```

- [ ] **Step 2: Vytvořit repository test (mock model pattern)**

```typescript
import { Test } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { MongoSecurityTokensRepository } from './security-tokens.repository';
import { SecurityTokenSchemaClass } from '../schemas/security-token.schema';

describe('MongoSecurityTokensRepository', () => {
  let repo: MongoSecurityTokensRepository;
  const mockModel = {
    create: jest.fn(),
    findOneAndDelete: jest.fn(() => ({
      lean: () => ({ exec: jest.fn() }),
    })),
    deleteMany: jest.fn(() => ({ exec: jest.fn() })),
  };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        MongoSecurityTokensRepository,
        {
          provide: getModelToken(SecurityTokenSchemaClass.name),
          useValue: mockModel,
        },
      ],
    }).compile();
    repo = module.get(MongoSecurityTokensRepository);
    jest.clearAllMocks();
  });

  it('save vytvoří záznam', async () => {
    mockModel.create.mockResolvedValue({});
    await repo.save({
      tokenHash: 'h1',
      userId: 'u1',
      type: 'password_reset',
      expiresAt: new Date('2026-12-31'),
    });
    expect(mockModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        tokenHash: 'h1',
        userId: 'u1',
        type: 'password_reset',
      }),
    );
  });

  it('consumeByHash vrátí { userId, meta } pokud doc nalezen a non-expired', async () => {
    mockModel.findOneAndDelete.mockReturnValue({
      lean: () => ({
        exec: jest.fn().mockResolvedValue({
          userId: 'u1',
          meta: { newEmail: 'x@y.cz' },
        }),
      }),
    });
    const now = new Date();
    const result = await repo.consumeByHash('h1', now);
    expect(result).toEqual({ userId: 'u1', meta: { newEmail: 'x@y.cz' } });
    expect(mockModel.findOneAndDelete).toHaveBeenCalledWith({
      tokenHash: 'h1',
      expiresAt: { $gt: now },
    });
  });

  it('consumeByHash vrátí null pokud doc nenalezen', async () => {
    mockModel.findOneAndDelete.mockReturnValue({
      lean: () => ({ exec: jest.fn().mockResolvedValue(null) }),
    });
    const result = await repo.consumeByHash('missing', new Date());
    expect(result).toBeNull();
  });

  it('consumeByHash respektuje expiresAt > now filter (passes correct query)', async () => {
    mockModel.findOneAndDelete.mockReturnValue({
      lean: () => ({ exec: jest.fn().mockResolvedValue(null) }),
    });
    const specificNow = new Date('2026-06-01T00:00:00Z');
    await repo.consumeByHash('h1', specificNow);
    expect(mockModel.findOneAndDelete).toHaveBeenCalledWith({
      tokenHash: 'h1',
      expiresAt: { $gt: specificNow },
    });
  });

  it('revokeAllForUser bez type → deleteMany jen userId filter', async () => {
    mockModel.deleteMany.mockReturnValue({ exec: jest.fn() });
    await repo.revokeAllForUser('u1');
    expect(mockModel.deleteMany).toHaveBeenCalledWith({ userId: 'u1' });
  });

  it('revokeAllForUser s type → deleteMany userId + type filter', async () => {
    mockModel.deleteMany.mockReturnValue({ exec: jest.fn() });
    await repo.revokeAllForUser('u1', 'password_reset');
    expect(mockModel.deleteMany).toHaveBeenCalledWith({
      userId: 'u1',
      type: 'password_reset',
    });
  });
});
```

- [ ] **Step 3: Run test — expect PASS**

Run: `cd backend && npx jest security-tokens.repository --no-coverage`
Expected: 6 tests pass.

- [ ] **Step 4: Verify typecheck**

Run: `cd backend && npm run typecheck`
Expected: 0 errors.

---

## Task 4: SecurityTokensService

**Files:**
- Create: `backend/src/modules/security-tokens/security-tokens.service.ts`
- Modify/Create: `backend/src/modules/security-tokens/security-tokens.service.spec.ts`

- [ ] **Step 1: Inspect existing spec (pokud existuje)**

Run: `ls backend/src/modules/security-tokens/security-tokens.service.spec.ts`
- Pokud existuje → načíst přes Read, zachovat existující testy, doplnit nové (viz Step 4).
- Pokud neexistuje → vytvořit nový v Step 4.

- [ ] **Step 2: Napsat service**

```typescript
import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import * as crypto from 'crypto';
import type { ISecurityTokensRepository } from './interfaces/security-tokens-repository.interface';
import type {
  SecurityTokenType,
  ConsumedToken,
} from './interfaces/security-token.interface';

@Injectable()
export class SecurityTokensService {
  constructor(
    @Inject('ISecurityTokensRepository')
    private readonly repo: ISecurityTokensRepository,
  ) {}

  /**
   * Vystaví nový token.
   * Plain token vrácený volajícímu (nikdy v DB), hash uložen.
   */
  async issue(
    userId: string,
    type: SecurityTokenType,
    ttlMs: number,
    meta?: Record<string, unknown>,
  ): Promise<string> {
    const plain = crypto.randomBytes(32).toString('hex');
    const tokenHash = this.hash(plain);
    const expiresAt = new Date(Date.now() + ttlMs);
    await this.repo.save({ tokenHash, userId, type, meta, expiresAt });
    return plain;
  }

  /**
   * Atomic consume — verify + delete jediným DB query.
   * Throws BadRequestException s code 'INVALID_TOKEN' pokud token neexistuje
   * nebo je expirovaný.
   */
  async consume(plainToken: string): Promise<ConsumedToken> {
    const tokenHash = this.hash(plainToken);
    const consumed = await this.repo.consumeByHash(tokenHash, new Date());
    if (!consumed) {
      throw new BadRequestException({
        statusCode: 400,
        message: 'Token je neplatný nebo expirovaný',
        code: 'INVALID_TOKEN',
      });
    }
    return consumed;
  }

  /**
   * SHA-256 hash. Public pro AuthService consistency.
   */
  hash(plain: string): string {
    return crypto.createHash('sha256').update(plain).digest('hex');
  }

  /**
   * Revoke všech tokenů userId, volitelně filtrované typem.
   */
  async revokeAllForUser(
    userId: string,
    type?: SecurityTokenType,
  ): Promise<void> {
    await this.repo.revokeAllForUser(userId, type);
  }
}
```

- [ ] **Step 3: Spustit existující spec (pokud byl)**

Run: `cd backend && npx jest security-tokens.service --no-coverage`
- Pokud existující testy projdou → continue Step 5
- Pokud failují → upravit service tak, aby matchla; uložit změny

- [ ] **Step 4: Doplnit/vytvořit service.spec.ts**

```typescript
import { Test } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { SecurityTokensService } from './security-tokens.service';

describe('SecurityTokensService', () => {
  let service: SecurityTokensService;
  const mockRepo = {
    save: jest.fn().mockResolvedValue(undefined),
    consumeByHash: jest.fn(),
    revokeAllForUser: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        SecurityTokensService,
        { provide: 'ISecurityTokensRepository', useValue: mockRepo },
      ],
    }).compile();
    service = module.get(SecurityTokensService);
    jest.clearAllMocks();
  });

  describe('issue', () => {
    it('vrátí 64-hex plain token', async () => {
      const tok = await service.issue('u1', 'password_reset', 60_000);
      expect(tok).toMatch(/^[0-9a-f]{64}$/);
    });

    it('save dostane hash (NE plain) + správný expiresAt', async () => {
      const before = Date.now();
      const tok = await service.issue('u1', 'password_reset', 60_000);
      const after = Date.now();
      expect(mockRepo.save).toHaveBeenCalledTimes(1);
      const arg = mockRepo.save.mock.calls[0][0];
      expect(arg.tokenHash).not.toBe(tok);
      expect(arg.tokenHash).toBe(service.hash(tok));
      expect(arg.userId).toBe('u1');
      expect(arg.type).toBe('password_reset');
      expect(arg.expiresAt.getTime()).toBeGreaterThanOrEqual(before + 60_000);
      expect(arg.expiresAt.getTime()).toBeLessThanOrEqual(after + 60_000);
    });

    it('issue s meta → uloží meta', async () => {
      await service.issue('u1', 'email_change', 60_000, {
        newEmail: 'x@y.cz',
      });
      expect(mockRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ meta: { newEmail: 'x@y.cz' } }),
      );
    });

    it('2× issue stejný userId+type → 2 různé plain tokens', async () => {
      const t1 = await service.issue('u1', 'password_reset', 60_000);
      const t2 = await service.issue('u1', 'password_reset', 60_000);
      expect(t1).not.toBe(t2);
    });
  });

  describe('consume', () => {
    it('valid token → vrátí { userId } z repo', async () => {
      mockRepo.consumeByHash.mockResolvedValue({ userId: 'u1' });
      const result = await service.consume('plain-token');
      expect(result).toEqual({ userId: 'u1' });
      expect(mockRepo.consumeByHash).toHaveBeenCalledWith(
        service.hash('plain-token'),
        expect.any(Date),
      );
    });

    it('valid token s meta → vrátí { userId, meta }', async () => {
      mockRepo.consumeByHash.mockResolvedValue({
        userId: 'u1',
        meta: { newEmail: 'x@y.cz' },
      });
      const result = await service.consume('plain');
      expect(result).toEqual({
        userId: 'u1',
        meta: { newEmail: 'x@y.cz' },
      });
    });

    it('invalid/expired token (repo null) → throws BadRequestException INVALID_TOKEN', async () => {
      mockRepo.consumeByHash.mockResolvedValue(null);
      await expect(service.consume('bad')).rejects.toMatchObject({
        response: { code: 'INVALID_TOKEN' },
      });
    });
  });

  describe('hash', () => {
    it('deterministický pro stejný input', () => {
      expect(service.hash('x')).toBe(service.hash('x'));
    });

    it('různé inputs → různé hashe', () => {
      expect(service.hash('x')).not.toBe(service.hash('y'));
    });

    it('formát = 64 hex chars (SHA-256)', () => {
      expect(service.hash('anything')).toMatch(/^[0-9a-f]{64}$/);
    });
  });

  describe('revokeAllForUser', () => {
    it('bez type → call repo s undefined type', async () => {
      await service.revokeAllForUser('u1');
      expect(mockRepo.revokeAllForUser).toHaveBeenCalledWith('u1', undefined);
    });

    it('s type → call repo s daným type', async () => {
      await service.revokeAllForUser('u1', 'password_reset');
      expect(mockRepo.revokeAllForUser).toHaveBeenCalledWith(
        'u1',
        'password_reset',
      );
    });
  });
});
```

- [ ] **Step 5: Spustit testy**

Run: `cd backend && npx jest security-tokens --no-coverage`
Expected: tests pass (≥ 12 mezi service + repo).

- [ ] **Step 6: Verify typecheck**

Run: `cd backend && npm run typecheck`
Expected: 0 errors.

---

## Task 5: SecurityTokensModule

**Files:**
- Create: `backend/src/modules/security-tokens/security-tokens.module.ts`

- [ ] **Step 1: Vytvořit module**

```typescript
import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  SecurityTokenSchemaClass,
  SecurityTokenSchema,
} from './schemas/security-token.schema';
import { SecurityTokensService } from './security-tokens.service';
import { MongoSecurityTokensRepository } from './repositories/security-tokens.repository';

@Global()
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: SecurityTokenSchemaClass.name, schema: SecurityTokenSchema },
    ]),
  ],
  providers: [
    SecurityTokensService,
    {
      provide: 'ISecurityTokensRepository',
      useClass: MongoSecurityTokensRepository,
    },
  ],
  exports: [SecurityTokensService],
})
export class SecurityTokensModule {}
```

- [ ] **Step 2: Verify typecheck**

Run: `cd backend && npm run typecheck`
Expected: 0 errors.

---

## Task 6: Mailer interfaces + types

**Files:**
- Create: `backend/src/modules/mailer/interfaces/mailer-provider.interface.ts`

- [ ] **Step 1: Vytvořit interface**

```typescript
export type MailerTemplate =
  | 'password_reset'
  | 'email_verification'
  | 'email_change_confirm'
  | 'email_change_notice'
  | 'username_decided'
  | 'account_deletion_scheduled';

export interface MailerPayload {
  to: string;
  username: string;
  // Variabilní podle template — konkrétní template-specific fields:
  token?: string; // password_reset, email_verification, email_change_confirm
  oldEmail?: string; // email_change_notice
  newEmail?: string; // email_change_notice
  decidedUsername?: string; // username_decided
  scheduledFor?: Date; // account_deletion_scheduled
}

/**
 * Provider rozhraní — implementuje konkrétní backend (Logger pro dev, SMTP/SendGrid prod).
 */
export interface IMailerProvider {
  send(template: MailerTemplate, payload: MailerPayload): Promise<void>;
}
```

- [ ] **Step 2: Verify typecheck**

Run: `cd backend && npm run typecheck`
Expected: 0 errors.

---

## Task 7: LogMailerProvider + test

**Files:**
- Create: `backend/src/modules/mailer/providers/log-mailer.provider.ts`
- Create: `backend/src/modules/mailer/providers/log-mailer.provider.spec.ts`

- [ ] **Step 1: Vytvořit provider**

```typescript
import { Injectable, Logger } from '@nestjs/common';
import type {
  IMailerProvider,
  MailerTemplate,
  MailerPayload,
} from '../interfaces/mailer-provider.interface';

/**
 * Dev/test provider — strukturovaný log namísto reálného emailu.
 * Pro prod: nahradit SmtpMailerProvider nebo SendGridMailerProvider
 * (separátní deploy task po SP1).
 */
@Injectable()
export class LogMailerProvider implements IMailerProvider {
  private readonly logger = new Logger(LogMailerProvider.name);

  async send(template: MailerTemplate, payload: MailerPayload): Promise<void> {
    this.logger.log(
      JSON.stringify({
        event: 'mailer.send',
        template,
        to: payload.to,
        username: payload.username,
        // Token zalogujeme jen prvních 8 chars — pro dev usability, ne plný leak.
        token: payload.token ? `${payload.token.slice(0, 8)}…` : undefined,
        meta: {
          oldEmail: payload.oldEmail,
          newEmail: payload.newEmail,
          decidedUsername: payload.decidedUsername,
          scheduledFor: payload.scheduledFor?.toISOString(),
        },
      }),
    );
    return Promise.resolve();
  }
}
```

- [ ] **Step 2: Vytvořit test**

```typescript
import { Logger } from '@nestjs/common';
import { LogMailerProvider } from './log-mailer.provider';

describe('LogMailerProvider', () => {
  let provider: LogMailerProvider;
  let logSpy: jest.SpyInstance;

  beforeEach(() => {
    provider = new LogMailerProvider();
    logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  it('zaloguje template + payload (token zkrácen na 8 chars)', async () => {
    await provider.send('password_reset', {
      to: 'a@a.com',
      username: 'alice',
      token: '0123456789abcdef0123456789abcdef',
    });
    expect(logSpy).toHaveBeenCalledTimes(1);
    const logged = JSON.parse(logSpy.mock.calls[0][0] as string);
    expect(logged.event).toBe('mailer.send');
    expect(logged.template).toBe('password_reset');
    expect(logged.to).toBe('a@a.com');
    expect(logged.username).toBe('alice');
    expect(logged.token).toBe('01234567…');
  });

  it('token chybí (email_change_notice template) → token: undefined v logu', async () => {
    await provider.send('email_change_notice', {
      to: 'a@a.com',
      username: 'alice',
      oldEmail: 'old@a.com',
      newEmail: 'new@a.com',
    });
    const logged = JSON.parse(logSpy.mock.calls[0][0] as string);
    expect(logged.token).toBeUndefined();
    expect(logged.meta.oldEmail).toBe('old@a.com');
    expect(logged.meta.newEmail).toBe('new@a.com');
  });
});
```

- [ ] **Step 3: Spustit testy**

Run: `cd backend && npx jest log-mailer --no-coverage`
Expected: 2 tests pass.

---

## Task 8: MailerService + test

**Files:**
- Create: `backend/src/modules/mailer/mailer.service.ts`
- Create: `backend/src/modules/mailer/mailer.service.spec.ts`

- [ ] **Step 1: Vytvořit service**

```typescript
import { Inject, Injectable, Logger } from '@nestjs/common';
import type {
  IMailerProvider,
  MailerTemplate,
  MailerPayload,
} from './interfaces/mailer-provider.interface';

@Injectable()
export class MailerService {
  private readonly logger = new Logger(MailerService.name);

  constructor(
    @Inject('IMailerProvider')
    private readonly provider: IMailerProvider,
  ) {}

  async sendPasswordReset(opts: {
    to: string;
    username: string;
    token: string;
  }): Promise<void> {
    await this.dispatch('password_reset', opts);
  }

  async sendEmailVerification(opts: {
    to: string;
    username: string;
    token: string;
  }): Promise<void> {
    await this.dispatch('email_verification', opts);
  }

  async sendEmailChangeConfirm(opts: {
    to: string;
    username: string;
    token: string;
  }): Promise<void> {
    await this.dispatch('email_change_confirm', opts);
  }

  async sendEmailChangeNotice(opts: {
    to: string;
    username: string;
    oldEmail: string;
    newEmail: string;
  }): Promise<void> {
    await this.dispatch('email_change_notice', opts);
  }

  async sendUsernameDecided(opts: {
    to: string;
    username: string;
    decidedUsername: string;
  }): Promise<void> {
    await this.dispatch('username_decided', opts);
  }

  async sendAccountDeletionScheduled(opts: {
    to: string;
    username: string;
    scheduledFor: Date;
  }): Promise<void> {
    await this.dispatch('account_deletion_scheduled', opts);
  }

  private async dispatch(
    template: MailerTemplate,
    payload: MailerPayload,
  ): Promise<void> {
    try {
      await this.provider.send(template, payload);
    } catch (err) {
      // Mailer fail nikdy nebreaké volající flow — log a swallow.
      this.logger.error(
        `Mailer send failed: template=${template} to=${payload.to}`,
        err instanceof Error ? err.stack : String(err),
      );
    }
  }
}
```

- [ ] **Step 2: Vytvořit test**

```typescript
import { Test } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { MailerService } from './mailer.service';
import type { IMailerProvider } from './interfaces/mailer-provider.interface';

describe('MailerService', () => {
  let service: MailerService;
  let mockProvider: jest.Mocked<IMailerProvider>;

  beforeEach(async () => {
    mockProvider = {
      send: jest.fn().mockResolvedValue(undefined),
    };
    const module = await Test.createTestingModule({
      providers: [
        MailerService,
        { provide: 'IMailerProvider', useValue: mockProvider },
      ],
    }).compile();
    service = module.get(MailerService);
  });

  it('sendPasswordReset → provider.send("password_reset", opts)', async () => {
    await service.sendPasswordReset({
      to: 'a@a.com',
      username: 'alice',
      token: 'tok',
    });
    expect(mockProvider.send).toHaveBeenCalledWith('password_reset', {
      to: 'a@a.com',
      username: 'alice',
      token: 'tok',
    });
  });

  it('sendEmailVerification → "email_verification"', async () => {
    await service.sendEmailVerification({
      to: 'a@a.com',
      username: 'alice',
      token: 'tok',
    });
    expect(mockProvider.send).toHaveBeenCalledWith(
      'email_verification',
      expect.objectContaining({ token: 'tok' }),
    );
  });

  it('sendEmailChangeConfirm → "email_change_confirm"', async () => {
    await service.sendEmailChangeConfirm({
      to: 'a@a.com',
      username: 'alice',
      token: 'tok',
    });
    expect(mockProvider.send).toHaveBeenCalledWith(
      'email_change_confirm',
      expect.objectContaining({ token: 'tok' }),
    );
  });

  it('sendEmailChangeNotice → "email_change_notice" + oldEmail/newEmail', async () => {
    await service.sendEmailChangeNotice({
      to: 'a@a.com',
      username: 'alice',
      oldEmail: 'old@a.com',
      newEmail: 'new@a.com',
    });
    expect(mockProvider.send).toHaveBeenCalledWith(
      'email_change_notice',
      expect.objectContaining({
        oldEmail: 'old@a.com',
        newEmail: 'new@a.com',
      }),
    );
  });

  it('sendUsernameDecided → "username_decided" + decidedUsername', async () => {
    await service.sendUsernameDecided({
      to: 'a@a.com',
      username: 'alice',
      decidedUsername: 'aliceNew',
    });
    expect(mockProvider.send).toHaveBeenCalledWith(
      'username_decided',
      expect.objectContaining({ decidedUsername: 'aliceNew' }),
    );
  });

  it('sendAccountDeletionScheduled → "account_deletion_scheduled" + scheduledFor', async () => {
    const dt = new Date('2026-06-01');
    await service.sendAccountDeletionScheduled({
      to: 'a@a.com',
      username: 'alice',
      scheduledFor: dt,
    });
    expect(mockProvider.send).toHaveBeenCalledWith(
      'account_deletion_scheduled',
      expect.objectContaining({ scheduledFor: dt }),
    );
  });

  it('provider throw → service nehází, jen loguje error', async () => {
    const errorSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => {});
    mockProvider.send.mockRejectedValueOnce(new Error('SMTP timeout'));
    await expect(
      service.sendPasswordReset({
        to: 'a@a.com',
        username: 'alice',
        token: 'tok',
      }),
    ).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
```

- [ ] **Step 3: Spustit testy**

Run: `cd backend && npx jest mailer.service --no-coverage`
Expected: 7 tests pass.

---

## Task 9: MailerModule

**Files:**
- Create: `backend/src/modules/mailer/mailer.module.ts`

- [ ] **Step 1: Vytvořit module**

```typescript
import { Global, Module } from '@nestjs/common';
import { MailerService } from './mailer.service';
import { LogMailerProvider } from './providers/log-mailer.provider';

@Global()
@Module({
  providers: [
    MailerService,
    {
      provide: 'IMailerProvider',
      useClass: LogMailerProvider,
    },
  ],
  exports: [MailerService],
})
export class MailerModule {}
```

- [ ] **Step 2: Verify typecheck**

Run: `cd backend && npm run typecheck`
Expected: 0 errors.

---

## Task 10: Wire moduly do app.module.ts

**Files:**
- Modify: `backend/src/app.module.ts`

- [ ] **Step 1: Přidat importy + zařadit do imports[]**

Najít sekci importů (kolem řádku 1–50) a přidat:

```typescript
import { SecurityTokensModule } from './modules/security-tokens/security-tokens.module';
import { MailerModule } from './modules/mailer/mailer.module';
```

Najít `@Module({ imports: [...] })` a přidat oba moduly do imports[] **před** AuthModule (pořadí: dependencies nejdřív, i když `@Global()` to neřeší striktně).

Příklad konečné podoby imports[] (před AuthModule):

```typescript
imports: [
  // ... existing config + database
  SecurityTokensModule,
  MailerModule,
  // ... rest including AuthModule
]
```

- [ ] **Step 2: Verify typecheck + spustit AppModule bootstrap test (pokud existuje)**

Run: `cd backend && npm run typecheck`
Expected: 0 errors.

Run: `cd backend && npx jest smoke-full-app --no-coverage` (pokud test existuje)
Expected: pass (full AppModule bootstrap).

---

## Task 11: Update tsconfig.json + eslint.config.mjs exclude

**Files:**
- Modify: `backend/tsconfig.json`
- Modify: `backend/eslint.config.mjs`

- [ ] **Step 1: Odebrat `security-tokens.service.spec.ts` z tsconfig exclude**

V `backend/tsconfig.json`, **odebrat** řádek:
```
"src/modules/security-tokens/security-tokens.service.spec.ts",
```

Final exclude list:

```json
"exclude": [
  "src/modules/auth/auth.service.spec.ts",
  "src/modules/users/users.service.spec.ts",
  "src/modules/users/services/account-cleanup.cron.spec.ts",
  "src/modules/admin/admin.module.ts",
  "src/modules/admin/admin.controller.ts",
  "src/modules/admin/admin.service.ts",
  "src/modules/admin/admin.service.spec.ts",
  "test/friendships.e2e-spec.ts",
  "test/game-events-upcoming-mine.e2e-spec.ts"
]
```

- [ ] **Step 2: Synchronizovat eslint.config.mjs ignores**

V `backend/eslint.config.mjs`, odebrat řádek:
```
'src/modules/security-tokens/security-tokens.service.spec.ts',
```

Final ignores (po SP0/eslint.config.mjs):

```javascript
ignores: [
  'eslint.config.mjs',
  'src/modules/auth/auth.service.spec.ts',
  'src/modules/users/users.service.spec.ts',
  'src/modules/users/services/account-cleanup.cron.spec.ts',
  'src/modules/admin/admin.module.ts',
  'src/modules/admin/admin.controller.ts',
  'src/modules/admin/admin.service.ts',
  'src/modules/admin/admin.service.spec.ts',
  'test/friendships.e2e-spec.ts',
  'test/game-events-upcoming-mine.e2e-spec.ts',
],
```

- [ ] **Step 3: Run typecheck + lint:check**

Run: `cd backend && npm run typecheck && npm run lint:check`
Expected: oba exit 0.

⚠️ **Pokud security-tokens.service.spec.ts existoval s broken obsahem** (referuje k metodám/typům, které neimplementujeme přesně): upravit ho tak, aby projde současně se Step 4 spec docu. Detail viz Task 4 Step 1.

---

## Task 12: Spustit kompletní test suite + verify

- [ ] **Step 1: Spustit všechny security-tokens + mailer testy**

Run: `cd backend && npx jest "security-tokens|mailer" --no-coverage`
Expected: ≥ 15 tests pass (6 repo + 12 service + 7 mailer.service + 2 log-mailer = 27 ideal, ≥ 15 minimum).

- [ ] **Step 2: Spustit celý unit suite (rychlá sanity)**

Run: `cd backend && npm test -- --no-coverage 2>&1 | tail -20`
Expected: no regressions od SP0. Existing test count se nesmí snížit.

- [ ] **Step 3: Final typecheck + lint**

Run: `cd backend && npm run typecheck && npm run lint:check`
Expected: oba exit 0.

---

## Task 13: Update dluhy.md + commit + push

**Files:**
- Modify: `docs/dluhy.md`

- [ ] **Step 1: Update master entry**

V `docs/dluhy.md`, najít sekci `[otevřeno 2026-05-14] BE fix-forward — SP1–SP6` a aktualizovat:

```markdown
### [otevřeno 2026-05-14, SP1 hotov 2026-05-14] BE fix-forward — zbývá SP2–SP6

- **Soubor:** mnoho — viz [be-fix-forward-decomposition](superpowers/specs/2026-05-14-be-fix-forward-decomposition.md)
- **Typ:** build/CI + chybějící feature implementace (~~Mailer~~ ✅, ~~SecurityTokens~~ ✅, AuthService email flows, UsersService extensions, Admin extensions, Friendships, DataExport)
- **Riziko:** main na origin neprojde plným typecheck bez transitional `tsconfig.json` + `eslint.config.mjs` ignore. AdminModule dočasně **disabled** v `app.module.ts` — `/api/admin/*` endpointy nedostupné dokud SP4 nelandí.
- **Co vyžaduje:** Postupné dokončení SP2–SP6, každý vlastní spec → plán → impl cyklus. Tato entry se přesouvá do "Vyřešené" po SP6.
- **Zdroj:** Audit 2026-05-14. SP0 (User entity + Pending→Zadatel + OptionalJwtAuthGuard + Login status + transitional config) hotov. **SP1 (Mailer + SecurityTokens infrastructure) hotov 2026-05-14** — viz commit hash a [SP1 spec](superpowers/specs/2026-05-14-sp1-mailer-security-tokens-design.md).
```

- [ ] **Step 2: Stage SP1 files**

```bash
git add backend/src/modules/security-tokens/
git add backend/src/modules/mailer/
git add backend/src/app.module.ts
git add backend/tsconfig.json
git add backend/eslint.config.mjs
git add docs/dluhy.md
git add docs/superpowers/specs/2026-05-14-sp1-mailer-security-tokens-design.md
git add docs/superpowers/plans/2026-05-14-sp1-mailer-security-tokens.md
```

- [ ] **Step 3: Commit**

```bash
git commit -m "$(cat <<'EOF'
feat(SP1): Mailer + SecurityTokens infrastructure

Druha vrstva BE fix-forward (viz docs/superpowers/specs/2026-05-14-be-fix-forward-decomposition.md).
Dva @Global() moduly, ktere SP2/SP3/SP4 injectuji.

SecurityTokensModule:
- Mongoose schema security_tokens + TTL index na expiresAt (auto-cleanup)
- Plain token jen v emailu/responsi, v DB jen SHA-256 hash
- Atomic consume pres findOneAndDelete (no TOCTOU race)
- 3 token types: password_reset | email_verify | email_change
- issue(userId, type, ttlMs, meta?) -> plain 64-hex token
- consume(plain) -> { userId, meta? } | throws BadRequestException INVALID_TOKEN
- hash(plain) public helper pro AuthService consistency
- revokeAllForUser(userId, type?) pro SP4 ban/delete handlers

MailerModule:
- IMailerProvider interface + LogMailerProvider dev backend (strukturovany Logger)
- MailerService dispatcher s 6 metodama (password_reset, email_verification,
  email_change_confirm, email_change_notice, username_decided,
  account_deletion_scheduled)
- dispatch() swallows errors (Mailer fail nebreaké caller flow)
- Token v logu zkracen na 8 chars (anti-leak)
- Prod provider (SMTP/SendGrid) plug-in pres env var = mimo SP1 scope

Testy: 27 nove zelene (6 repo + 11 service + 7 mailer.service + 2 log-mailer + 1 z toho 1.7 spec)

Wiring:
- app.module.ts importuje SecurityTokensModule + MailerModule pred AuthModule
- tsconfig.json + eslint.config.mjs: odebran security-tokens.service.spec z exclude

Co zbyva: SP2 (Auth email flows), SP3 (UsersService extensions), SP4 (Admin
extensions), SP5 (Friendships), SP6 (DataExport).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

Expected: pre-commit hook pass (typecheck + lint), commit vytvoren.

- [ ] **Step 4: Push**

```bash
git push origin main
```

Expected: pushed.

⚠️ **Pokud auto-mode classifier znovu odmítne push:** požádat uživatele o autorizaci.

---

## Self-Review (post-plan)

### Spec coverage check

| Spec sekce | Implementuje task |
|---|---|
| 1.1 SecurityToken schema | Task 2 |
| 1.2 SecurityToken interfaces | Task 1 |
| 1.3 ISecurityTokensRepository | Task 1 |
| 1.4 Mongo repository impl | Task 3 |
| 1.5 SecurityTokensService | Task 4 |
| 1.6 SecurityTokensModule | Task 5 |
| 2.1 Mailer interfaces | Task 6 |
| 2.2 MailerService | Task 8 |
| 2.3 LogMailerProvider | Task 7 |
| 2.4 MailerModule | Task 9 |
| 3. Wire to app.module | Task 10 |
| 4.1 SecurityTokensService tests | Task 4 Step 4 |
| 4.2 Repository tests | Task 3 Step 2 |
| 4.3 MailerService tests | Task 8 Step 2 |
| 4.4 LogMailerProvider tests | Task 7 Step 2 |
| 4.5 Integration smoke | Task 12 |
| 5. Validation criteria | Tasks 11–13 |

### Placeholder scan

- ✅ Žádné "TBD" — všechny tasky mají konkrétní code blocks.
- ✅ Žádné "implement later" — implementace v každém tasku.
- ✅ Žádné "similar to Task N" — code repetition kde potřeba.

### Type consistency

- `SecurityTokenType` definováno v Task 1, used v Task 2 (schema), Task 3 (repo), Task 4 (service).
- `ConsumedToken` definováno v Task 1, vrácený z Task 3 repo + Task 4 service.
- `MailerTemplate`, `MailerPayload`, `IMailerProvider` definovány v Task 6, used v Task 7 + Task 8.
- `ISecurityTokensRepository` definováno v Task 1, implementováno v Task 3, injectováno v Task 4 přes string token `'ISecurityTokensRepository'`.
- Module file order v Task 10 (app.module.ts wire) — SecurityTokensModule a MailerModule importovány **před** AuthModule.

### Existing spec compatibility

Pre-Task Step 0 check: pokud `security-tokens.service.spec.ts` už existuje (z předchozího WIP commitu), Task 4 Step 1 ho inspektuje a Step 4 ho rozšíří. Žádný overwrite.

---

## Plán hotov.
