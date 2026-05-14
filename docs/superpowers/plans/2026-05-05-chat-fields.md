# Chat Fields Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Doplnit chybějící pole na ChatChannel (`type`) a ChatMessage (`customFont`, `color`, `isDiceRoll`), opravit soft-delete text, přidat dice delete guard, převést UpdateMessageDto na diff-based attachment edit.

**Architecture:** Postupné rozšíření existujícího chat modulu. Schema a interface změny → DTO změny → service logika (dice detect, dice guard, soft-delete text, diff attachments) → testy. Žádný nový modul ani gateway. TDD per service změna.

**Tech Stack:** NestJS 10, Mongoose, class-validator, Jest + @nestjs/testing.

**Spec:** [docs/superpowers/specs/2026-05-05-chat-fields-design.md](../specs/2026-05-05-chat-fields-design.md)

---

## File Structure

**Modify:**
- `backend/src/modules/chat/schemas/chat-channel.schema.ts` — přidat `type: string` field
- `backend/src/modules/chat/schemas/chat-message.schema.ts` — přidat `customFont`, `color`, `isDiceRoll`
- `backend/src/modules/chat/interfaces/chat-channel.interface.ts` — `type: string` na entity
- `backend/src/modules/chat/interfaces/chat-message.interface.ts` — nové fieldy
- `backend/src/modules/chat/dto/create-channel.dto.ts` — `type?` field
- `backend/src/modules/chat/dto/update-channel.dto.ts` — `type?` field
- `backend/src/modules/chat/dto/create-message.dto.ts` — `customFont?`, `color?` fieldy
- `backend/src/modules/chat/dto/update-message.dto.ts` — kompletně přepsat na diff
- `backend/src/modules/chat/repositories/chat-message.repository.ts` — `toEntity` mapuje nové fieldy
- `backend/src/modules/chat/repositories/chat-channel.repository.ts` — `toEntity` mapuje `type`
- `backend/src/modules/chat/chat.service.ts` — sendMessage (dice detect + customFont/color), deleteMessage (dice guard + soft-delete text), editMessage (diff attachments)
- `backend/src/modules/chat/chat.service.spec.ts` — nové testy

**Beze změny:**
- `backend/src/modules/chat/chat.module.ts`
- `backend/src/modules/chat/chat.controller.ts` (DTOs se mění, controller signatury zůstávají)
- `backend/src/modules/chat/chat.gateway.ts`

---

## Předpoklady

Před začátkem ověř:
- `WorldRole.PomocnyPJ = 2`, `WorldRole.PJ = 3` ([world-membership.interface.ts](../../../backend/src/modules/worlds/interfaces/world-membership.interface.ts))
- `UserRole.Superadmin = 1`, `UserRole.Admin = 2` (Admin/Superadmin je `role <= 2`)
- `ChatAttachmentDto` má pole `publicId: string` ([chat-attachment.dto.ts:6](../../../backend/src/modules/chat/dto/chat-attachment.dto.ts))
- `canManageChat` v chat.service.ts dělá globální Admin bypass + `WorldRole.PomocnyPJ` per-world ([chat.service.ts:43-48](../../../backend/src/modules/chat/chat.service.ts))
- Existující `chat.service.spec.ts` má testy pro `sendMessage`, `editMessage`, `deleteMessage` — rozšiřuju, neredělám
- Globální `ValidationPipe` se `whitelist: true, transform: true` → pole mimo DTO se tiše drop-nou

---

## Task 1: Schema rozšíření — Channel.type

**Files:**
- Modify: `backend/src/modules/chat/schemas/chat-channel.schema.ts`
- Modify: `backend/src/modules/chat/interfaces/chat-channel.interface.ts`
- Modify: `backend/src/modules/chat/repositories/chat-channel.repository.ts`

- [ ] **Step 1.1: Rozšířit ChatChannelSchemaClass**

V `chat-channel.schema.ts` přidat **za** existující `@Prop({ default: false }) isDeleted` (na konec class):

```ts
  @Prop({ type: String, default: 'all' }) type: string;
```

- [ ] **Step 1.2: Rozšířit ChatChannel interface**

V `chat-channel.interface.ts` přidat `type: string` před `createdAt`:

```ts
export interface ChatChannel {
  id: string;
  groupId: string | null;
  worldId: string | null;
  name: string;
  isGlobal: boolean;
  accessMode: 'all' | 'roles' | 'members';
  allowedRoles: WorldRole[];
  allowedMemberIds: string[];
  lastMessageAt?: Date;
  order: number;
  isDeleted: boolean;
  type: string;
  createdAt: Date;
}
```

- [ ] **Step 1.3: Aktualizovat toEntity v chat-channel.repository.ts**

Najdi metodu `toEntity` (nebo equivalent) a přidej do návratového objektu:

```ts
type: (doc.type as string) ?? 'all',
```

Pokud repo používá `BaseMongoRepository` se sdíleným `toEntity`, najdi konkrétní implementaci v souboru. Pole musí mít fallback `'all'` pro existující dokumenty bez fieldu.

- [ ] **Step 1.4: Build kontrola**

Run: `cd backend && npm run build`
Expected: clean build

- [ ] **Step 1.5: Commit**

```bash
git add backend/src/modules/chat/schemas/chat-channel.schema.ts backend/src/modules/chat/interfaces/chat-channel.interface.ts backend/src/modules/chat/repositories/chat-channel.repository.ts
git commit -m "feat(chat): ChatChannel.type pole (volný string, default 'all')"
```

---

## Task 2: Schema rozšíření — Message customFont/color/isDiceRoll

**Files:**
- Modify: `backend/src/modules/chat/schemas/chat-message.schema.ts`
- Modify: `backend/src/modules/chat/interfaces/chat-message.interface.ts`
- Modify: `backend/src/modules/chat/repositories/chat-message.repository.ts`

- [ ] **Step 2.1: Rozšířit ChatMessageSchemaClass**

V `chat-message.schema.ts` přidat za `@Prop({ type: Date }) expiresAt?` (na konec class):

```ts
  @Prop({ type: String, default: null }) customFont: string | null;

  @Prop({
    enum: ['red', 'blue', 'green', 'yellow', 'purple', 'orange', 'pink', 'cyan', 'default'],
    default: null,
    type: String,
  })
  color: string | null;

  @Prop({ default: false }) isDiceRoll: boolean;
```

- [ ] **Step 2.2: Rozšířit ChatMessage interface**

V `chat-message.interface.ts` přidat před `createdAt`:

```ts
  customFont: string | null;
  color: string | null;
  isDiceRoll: boolean;
```

- [ ] **Step 2.3: Aktualizovat toEntity v chat-message.repository.ts**

Najdi `toEntity` a přidej do návratového objektu:

```ts
customFont: (doc.customFont as string | null) ?? null,
color: (doc.color as string | null) ?? null,
isDiceRoll: (doc.isDiceRoll as boolean) ?? false,
```

- [ ] **Step 2.4: Build kontrola**

Run: `cd backend && npm run build`
Expected: clean (může chybět test nasazování `isDiceRoll` v service — to je OK, pro to je Task 5)

Pokud build padá kvůli existujícím testům (mock objekty bez nových fields), oprav v testech mock objekty přidáním:
```ts
customFont: null, color: null, isDiceRoll: false,
```

- [ ] **Step 2.5: Spustit existující chat testy**

Run: `cd backend && npx jest chat.service.spec --no-coverage`
Expected: PASS — ne všechny mocky mohou mít nové fieldy, ale pokud testy aktuálně pokrývají jen `content/isEdited/...`, projdou. Pokud padají kvůli typovým chybám, doplň mocky.

- [ ] **Step 2.6: Commit**

```bash
git add backend/src/modules/chat/schemas/chat-message.schema.ts backend/src/modules/chat/interfaces/chat-message.interface.ts backend/src/modules/chat/repositories/chat-message.repository.ts backend/src/modules/chat/chat.service.spec.ts
git commit -m "feat(chat): ChatMessage customFont/color/isDiceRoll fields"
```

---

## Task 3: DTO — Channel.type + Message customFont/color

**Files:**
- Modify: `backend/src/modules/chat/dto/create-channel.dto.ts`
- Modify: `backend/src/modules/chat/dto/update-channel.dto.ts`
- Modify: `backend/src/modules/chat/dto/create-message.dto.ts`

- [ ] **Step 3.1: CreateChannelDto + type**

V `create-channel.dto.ts` přidat na konec class:

```ts
  @IsOptional() @IsString() @MaxLength(32) type?: string;
```

- [ ] **Step 3.2: UpdateChannelDto + type**

V `update-channel.dto.ts` přidat na konec class:

```ts
  @IsOptional() @IsString() @MaxLength(32) type?: string;
```

- [ ] **Step 3.3: CreateMessageDto + customFont/color**

V `create-message.dto.ts` přidat za existující pole (před uzavírací `}`):

```ts
  @IsOptional() @IsString() @MaxLength(64)
  customFont?: string;

  @IsOptional() @IsIn(['red', 'blue', 'green', 'yellow', 'purple', 'orange', 'pink', 'cyan', 'default'])
  color?: string;
```

Importy: zajisti `IsIn` v importech z class-validator.

- [ ] **Step 3.4: Propagovat dto.type v createChannel**

V `chat.service.ts` najdi metodu `createChannel`. V objektu předaném do `channelRepo.save({...})` přidej za `isDeleted: false`:

```ts
      type: dto.type ?? 'all',
```

(Bez tohoto by `dto.type` z body bylo ignorováno — service explicit-listuje fieldy.)

`updateChannel` používá `channelRepo.update(channelId, dto)` který předá celé DTO `$set`em, takže type prochází automaticky — beze změny v service.

- [ ] **Step 3.5: Build**

Run: `cd backend && npm run build`
Expected: clean

- [ ] **Step 3.6: Commit**

```bash
git add backend/src/modules/chat/dto/create-channel.dto.ts backend/src/modules/chat/dto/update-channel.dto.ts backend/src/modules/chat/dto/create-message.dto.ts backend/src/modules/chat/chat.service.ts
git commit -m "feat(chat): DTOs — Channel.type + Message customFont/color (+ createChannel propagate)"
```

---

## Task 4: UpdateMessageDto — diff-based attachments

**Files:**
- Modify: `backend/src/modules/chat/dto/update-message.dto.ts`

- [ ] **Step 4.1: Přepsat UpdateMessageDto**

Kompletně nahraď obsah `update-message.dto.ts`:

```ts
import { IsString, IsArray, MinLength, MaxLength, IsOptional, ValidateNested, ArrayMaxSize } from 'class-validator';
import { Type } from 'class-transformer';
import { ChatAttachmentDto } from './chat-attachment.dto';

export class UpdateMessageDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(4000)
  content?: string;

  @IsOptional() @IsArray() @ValidateNested({ each: true }) @ArrayMaxSize(10)
  @Type(() => ChatAttachmentDto)
  attachmentsToAdd?: ChatAttachmentDto[];

  @IsOptional() @IsArray() @IsString({ each: true }) @ArrayMaxSize(20)
  attachmentsToRemove?: string[];
}
```

- [ ] **Step 4.2: Build**

Run: `cd backend && npm run build`
Expected: clean

Note: chat.service.ts use `dto.content` directly — proběhne typové ladění, ale runtime crash při edit zatím nehrozí (TS dovolí `string | undefined`). Service oprav v Task 5.

Pokud build padne kvůli `dto.content` typu (např. ve volání `messageRepo.update({ content: dto.content, ... })`), explicitní typový workaround NEDĚLEJ — Task 5 to opravuje strukturálně.

- [ ] **Step 4.3: Commit**

```bash
git add backend/src/modules/chat/dto/update-message.dto.ts
git commit -m "feat(chat): UpdateMessageDto — diff attachments (add/remove)"
```

---

## Task 5: Service — sendMessage (dice detect + customFont/color)

**Files:**
- Modify: `backend/src/modules/chat/chat.service.ts`
- Modify: `backend/src/modules/chat/chat.service.spec.ts`

- [ ] **Step 5.1: Failing testy pro dice detection a nová pole**

V `chat.service.spec.ts` najdi `describe('sendMessage', ...)` blok a přidej dovnitř (před uzavírací `})`):

```ts
    it('detekuje dice roll z content prefixu HOD FATE', async () => {
      mockChannelRepo.findById.mockResolvedValue(mockChannel);
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(mockPJMembership);
      mockMembershipRepo.findByWorldId.mockResolvedValue([mockPJMembership]);
      mockMessageRepo.save.mockImplementation((data) => Promise.resolve({
        id: 'msg1', channelId: 'ch1', worldId: 'world1', senderId: 'user1', senderName: 'user1',
        isEdited: false, isDeleted: false, reactions: {}, attachments: [], customFont: null, color: null,
        createdAt: new Date(), updatedAt: new Date(),
        ...data,
      }));
      mockChannelRepo.update.mockResolvedValue(mockChannel);
      const result = await service.sendMessage('ch1', { content: '🎲 HOD FATE: 6' }, mockPJ);
      expect(result.isDiceRoll).toBe(true);
    });

    it('detekuje dice roll z prefixu Hod Kostkou', async () => {
      mockChannelRepo.findById.mockResolvedValue(mockChannel);
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(mockPJMembership);
      mockMembershipRepo.findByWorldId.mockResolvedValue([mockPJMembership]);
      mockMessageRepo.save.mockImplementation((data) => Promise.resolve({
        id: 'msg1', channelId: 'ch1', worldId: 'world1', senderId: 'user1', senderName: 'user1',
        isEdited: false, isDeleted: false, reactions: {}, attachments: [], customFont: null, color: null,
        createdAt: new Date(), updatedAt: new Date(),
        ...data,
      }));
      mockChannelRepo.update.mockResolvedValue(mockChannel);
      const result = await service.sendMessage('ch1', { content: 'Hod Kostkou: 1d20 = 15' }, mockPJ);
      expect(result.isDiceRoll).toBe(true);
    });

    it('běžný text nedostane isDiceRoll', async () => {
      mockChannelRepo.findById.mockResolvedValue(mockChannel);
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(mockPJMembership);
      mockMembershipRepo.findByWorldId.mockResolvedValue([mockPJMembership]);
      mockMessageRepo.save.mockImplementation((data) => Promise.resolve({
        id: 'msg1', channelId: 'ch1', worldId: 'world1', senderId: 'user1', senderName: 'user1',
        isEdited: false, isDeleted: false, reactions: {}, attachments: [], customFont: null, color: null,
        createdAt: new Date(), updatedAt: new Date(),
        ...data,
      }));
      mockChannelRepo.update.mockResolvedValue(mockChannel);
      const result = await service.sendMessage('ch1', { content: 'ahoj' }, mockPJ);
      expect(result.isDiceRoll).toBe(false);
    });

    it('uloží customFont a color do DB', async () => {
      mockChannelRepo.findById.mockResolvedValue(mockChannel);
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(mockPJMembership);
      mockMembershipRepo.findByWorldId.mockResolvedValue([mockPJMembership]);
      mockMessageRepo.save.mockImplementation((data) => Promise.resolve({
        id: 'msg1', channelId: 'ch1', worldId: 'world1', senderId: 'user1', senderName: 'user1',
        isEdited: false, isDeleted: false, reactions: {}, attachments: [],
        createdAt: new Date(), updatedAt: new Date(),
        ...data,
      }));
      mockChannelRepo.update.mockResolvedValue(mockChannel);
      await service.sendMessage('ch1', { content: 'x', customFont: 'Press Start 2P', color: 'red' }, mockPJ);
      const savedArg = mockMessageRepo.save.mock.calls[0][0];
      expect(savedArg.customFont).toBe('Press Start 2P');
      expect(savedArg.color).toBe('red');
    });

    it('klientův isDiceRoll v body je ignorován (whitelist)', async () => {
      mockChannelRepo.findById.mockResolvedValue(mockChannel);
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(mockPJMembership);
      mockMembershipRepo.findByWorldId.mockResolvedValue([mockPJMembership]);
      mockMessageRepo.save.mockImplementation((data) => Promise.resolve({
        id: 'msg1', channelId: 'ch1', worldId: 'world1', senderId: 'user1', senderName: 'user1',
        isEdited: false, isDeleted: false, reactions: {}, attachments: [], customFont: null, color: null,
        createdAt: new Date(), updatedAt: new Date(),
        ...data,
      }));
      mockChannelRepo.update.mockResolvedValue(mockChannel);
      // Cast přes `as never` protože isDiceRoll není v CreateMessageDto
      await service.sendMessage('ch1', { content: 'běžný text', isDiceRoll: true } as never, mockPJ);
      const savedArg = mockMessageRepo.save.mock.calls[0][0];
      expect(savedArg.isDiceRoll).toBe(false);  // backend rozhodne dle content, ignoruje klienta
    });
```

- [ ] **Step 5.2: Spustit testy — must FAIL**

Run: `cd backend && npx jest chat.service.spec --no-coverage`
Expected: FAIL — `result.isDiceRoll` je undefined nebo `savedArg.customFont` undefined

- [ ] **Step 5.3: Implementovat dice detection a propagaci customFont/color**

V `chat.service.ts` najdi metodu `sendMessage`. Přidej **těsně před** `const message = await this.messageRepo.save({` blok:

```ts
    const DICE_REGEX = /^(🎲\s*HOD\s+FATE:|Hod\s+Kostkou)/i;
    const isDiceRoll = dto.content ? DICE_REGEX.test(dto.content.trim()) : false;
```

A v objektu předaném do `messageRepo.save({...})` přidej tato pole (za `attachments: dto.attachments ?? []`):

```ts
      customFont: dto.customFont ?? null,
      color: dto.color ?? null,
      isDiceRoll,
```

- [ ] **Step 5.4: Spustit testy — must PASS**

Run: `cd backend && npx jest chat.service.spec --no-coverage`
Expected: PASS — všechny testy včetně 5 nových

- [ ] **Step 5.5: Commit**

```bash
git add backend/src/modules/chat/chat.service.ts backend/src/modules/chat/chat.service.spec.ts
git commit -m "feat(chat): sendMessage — dice detection + customFont/color propagace"
```

---

## Task 6: Service — deleteMessage (dice guard + soft-delete text)

**Files:**
- Modify: `backend/src/modules/chat/chat.service.ts`
- Modify: `backend/src/modules/chat/chat.service.spec.ts`

- [ ] **Step 6.1: Failing testy**

V `chat.service.spec.ts` najdi `describe('deleteMessage', ...)` blok a uvnitř přidej:

```ts
    const diceMsg = { id: 'msg1', channelId: 'ch1', worldId: 'world1', senderId: 'user1', senderName: 'user1', content: '🎲 HOD FATE: 6', isEdited: false, isDeleted: false, reactions: {}, attachments: [], customFont: null, color: null, isDiceRoll: true, createdAt: new Date(), updatedAt: new Date() };

    it('soft-delete nastaví content na finální text', async () => {
      const normalMsg = { ...diceMsg, content: 'běžný', isDiceRoll: false };
      mockMessageRepo.findById.mockResolvedValue(normalMsg);
      mockMessageRepo.update.mockResolvedValue({ ...normalMsg, isDeleted: true, content: '*Zpráva byla smazána autorem*' });
      await service.deleteMessage('msg1', mockPJ);
      expect(mockMessageRepo.update).toHaveBeenCalledWith('msg1', {
        isDeleted: true,
        content: '*Zpráva byla smazána autorem*',
      });
    });

    it('Hrac vlastník nemůže smazat dice roll → 403', async () => {
      mockMessageRepo.findById.mockResolvedValue(diceMsg);
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(mockHracMembership);
      const ownerHrac = { id: 'user1', role: UserRole.Hrac, username: 'user1' };
      await expect(service.deleteMessage('msg1', ownerHrac)).rejects.toThrow(ForbiddenException);
    });

    it('PomocnýPJ může smazat cizí dice roll', async () => {
      mockMessageRepo.findById.mockResolvedValue(diceMsg);
      const pomocnyPjMembership = { ...mockPJMembership, role: WorldRole.PomocnyPJ };
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(pomocnyPjMembership);
      mockMessageRepo.update.mockResolvedValue({ ...diceMsg, isDeleted: true, content: '*Zpráva byla smazána autorem*' });
      await service.deleteMessage('msg1', mockPJ);
      expect(mockMessageRepo.update).toHaveBeenCalled();
    });

    it('PJ může smazat dice roll', async () => {
      mockMessageRepo.findById.mockResolvedValue(diceMsg);
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(mockPJMembership);
      mockMessageRepo.update.mockResolvedValue({ ...diceMsg, isDeleted: true, content: '*Zpráva byla smazána autorem*' });
      await service.deleteMessage('msg1', mockPJ);
      expect(mockMessageRepo.update).toHaveBeenCalled();
    });

    it('Globální Admin může smazat dice roll i bez membership', async () => {
      mockMessageRepo.findById.mockResolvedValue(diceMsg);
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(null);
      mockMessageRepo.update.mockResolvedValue({ ...diceMsg, isDeleted: true, content: '*Zpráva byla smazána autorem*' });
      await service.deleteMessage('msg1', mockAdmin);
      expect(mockMessageRepo.update).toHaveBeenCalled();
    });

    it('Globální Admin může smazat dice roll v global chatu (worldId=null)', async () => {
      const globalDice = { ...diceMsg, worldId: null };
      mockMessageRepo.findById.mockResolvedValue(globalDice);
      mockMessageRepo.update.mockResolvedValue({ ...globalDice, isDeleted: true, content: '*Zpráva byla smazána autorem*' });
      await service.deleteMessage('msg1', mockAdmin);
      expect(mockMessageRepo.update).toHaveBeenCalled();
    });

    it('Hrac vlastník nemůže smazat dice roll v global chatu', async () => {
      const globalDice = { ...diceMsg, worldId: null };
      mockMessageRepo.findById.mockResolvedValue(globalDice);
      const ownerHrac = { id: 'user1', role: UserRole.Hrac, username: 'user1' };
      await expect(service.deleteMessage('msg1', ownerHrac)).rejects.toThrow(ForbiddenException);
    });
```

Note: `mockAdmin` musí být dostupný v scope. Pokud ještě neexistuje, přidej na začátek souboru spec u ostatních mock konstant:

```ts
const mockAdmin: { id: string; role: UserRole; username: string } = { id: 'admin1', role: UserRole.Admin, username: 'admin1' };
```

(Pravděpodobně už existuje — ověř nahoře v souboru.)

- [ ] **Step 6.2: Spustit — must FAIL**

Run: `cd backend && npx jest chat.service.spec --no-coverage`
Expected: FAIL — `mockMessageRepo.update` volán s `content: null` místo finálního textu, dice guard chybí

- [ ] **Step 6.3: Přepsat deleteMessage**

V `chat.service.ts` najdi `async deleteMessage(...)` a celou metodu nahraď:

```ts
  async deleteMessage(messageId: string, requester: RequestUser): Promise<{ message: string }> {
    const msg = await this.messageRepo.findById(messageId);
    if (!msg || msg.isDeleted) throw new NotFoundException('Zpráva nenalezena');

    if (msg.isDiceRoll) {
      // Dice guard — kostky může mazat jen PJ/PomocnýPJ světa nebo globální Admin/Superadmin
      // canManageChat sám dělá Admin bypass pro non-null worldId; pro global chat (worldId=null)
      // ho dělám zvlášť přes role <= UserRole.Admin
      const allowed = msg.worldId
        ? await this.canManageChat(requester, msg.worldId)
        : requester.role <= UserRole.Admin;
      if (!allowed) {
        throw new ForbiddenException('Kostky může mazat jen PJ nebo Admin');
      }
    } else {
      // Standardní ownership check pro běžné zprávy
      const canDelete = msg.senderId === requester.id || (msg.worldId && (await this.canManageChat(requester, msg.worldId)));
      if (!canDelete) throw new ForbiddenException('Nedostatečná oprávnění');
    }

    await this.messageRepo.update(messageId, {
      isDeleted: true,
      content: '*Zpráva byla smazána autorem*',
    });
    this.eventEmitter.emit('chat.message.deleted', { channelId: msg.channelId, messageId, attachments: msg.attachments });
    return { message: 'Zpráva smazána' };
  }
```

- [ ] **Step 6.4: Spustit testy — must PASS**

Run: `cd backend && npx jest chat.service.spec --no-coverage`
Expected: PASS

Note: existující test "should soft-delete message (content=null, isDeleted=true)" v chat.service.spec.ts musí být aktualizován — assertuje `content: null` ale teď je `content: '*Zpráva byla smazána autorem*'`. Najdi tu specifickou it() (přibližně řádek 188) a změň očekávaný content:

```ts
    it('should soft-delete message (content set, isDeleted=true)', async () => {
      mockMessageRepo.findById.mockResolvedValue(mockMsg);
      mockMessageRepo.update.mockResolvedValue({ ...mockMsg, content: '*Zpráva byla smazána autorem*', isDeleted: true });
      await service.deleteMessage('msg1', mockPJ);
      expect(mockMessageRepo.update).toHaveBeenCalledWith('msg1', { isDeleted: true, content: '*Zpráva byla smazána autorem*' });
    });
```

Také pokud `mockMsg` v deleteMessage describe nemá `isDiceRoll: false`, doplň ho (jinak guard padne kvůli undefined).

- [ ] **Step 6.5: Commit**

```bash
git add backend/src/modules/chat/chat.service.ts backend/src/modules/chat/chat.service.spec.ts
git commit -m "feat(chat): deleteMessage — dice guard + finální soft-delete text"
```

---

## Task 7: Service — editMessage (diff attachments)

**Files:**
- Modify: `backend/src/modules/chat/chat.service.ts`
- Modify: `backend/src/modules/chat/chat.service.spec.ts`

- [ ] **Step 7.1: Failing testy**

V `chat.service.spec.ts` najdi `describe('editMessage', ...)` blok a uvnitř přidej:

```ts
    const msgWithAtt = {
      ...mockMsg,
      attachments: [
        { url: 'u1', publicId: 'p1', type: 'image' as const, mimeType: 'image/png', filename: 'a.png', size: 100 },
        { url: 'u2', publicId: 'p2', type: 'image' as const, mimeType: 'image/png', filename: 'b.png', size: 200 },
      ],
    };

    it('attachmentsToAdd přidá k existujícím', async () => {
      mockMessageRepo.findById.mockResolvedValue(msgWithAtt);
      mockMessageRepo.update.mockImplementation((_id, data) => Promise.resolve({ ...msgWithAtt, ...data }));
      const newAtt = { url: 'u3', publicId: 'p3', type: 'image' as const, mimeType: 'image/png', filename: 'c.png', size: 300 };
      const result = await service.editMessage('msg1', { attachmentsToAdd: [newAtt] }, mockPJ);
      expect(result.attachments).toHaveLength(3);
      expect(result.attachments?.map((a) => a.publicId)).toEqual(['p1', 'p2', 'p3']);
    });

    it('attachmentsToRemove odebere podle publicId', async () => {
      mockMessageRepo.findById.mockResolvedValue(msgWithAtt);
      mockMessageRepo.update.mockImplementation((_id, data) => Promise.resolve({ ...msgWithAtt, ...data }));
      const result = await service.editMessage('msg1', { attachmentsToRemove: ['p1'] }, mockPJ);
      expect(result.attachments).toHaveLength(1);
      expect(result.attachments?.[0].publicId).toBe('p2');
    });

    it('attachmentsToAdd + attachmentsToRemove kombinace funguje', async () => {
      mockMessageRepo.findById.mockResolvedValue(msgWithAtt);
      mockMessageRepo.update.mockImplementation((_id, data) => Promise.resolve({ ...msgWithAtt, ...data }));
      const newAtt = { url: 'u3', publicId: 'p3', type: 'image' as const, mimeType: 'image/png', filename: 'c.png', size: 300 };
      const result = await service.editMessage('msg1', {
        attachmentsToRemove: ['p1'],
        attachmentsToAdd: [newAtt],
      }, mockPJ);
      expect(result.attachments?.map((a) => a.publicId)).toEqual(['p2', 'p3']);
    });

    it('attachmentsToRemove na neexistující publicId tiše ignoruje', async () => {
      mockMessageRepo.findById.mockResolvedValue(msgWithAtt);
      mockMessageRepo.update.mockImplementation((_id, data) => Promise.resolve({ ...msgWithAtt, ...data }));
      const result = await service.editMessage('msg1', { attachmentsToRemove: ['ghost'] }, mockPJ);
      expect(result.attachments).toHaveLength(2);
    });

    it('součet >10 attachmentů → 400', async () => {
      const fullMsg = {
        ...mockMsg,
        attachments: Array.from({ length: 9 }, (_, i) => ({
          url: `u${i}`, publicId: `p${i}`, type: 'image' as const, mimeType: 'image/png', filename: `f${i}.png`, size: 100,
        })),
      };
      mockMessageRepo.findById.mockResolvedValue(fullMsg);
      const newAtts = Array.from({ length: 2 }, (_, i) => ({
        url: `un${i}`, publicId: `np${i}`, type: 'image' as const, mimeType: 'image/png', filename: `n${i}.png`, size: 100,
      }));
      await expect(service.editMessage('msg1', { attachmentsToAdd: newAtts }, mockPJ))
        .rejects.toThrow(BadRequestException);
    });

    it('prázdné body (žádné z trojice) → 400', async () => {
      mockMessageRepo.findById.mockResolvedValue(mockMsg);
      await expect(service.editMessage('msg1', {}, mockPJ)).rejects.toThrow(BadRequestException);
    });

    it('content beze změny attachmentů — funguje', async () => {
      mockMessageRepo.findById.mockResolvedValue(msgWithAtt);
      mockMessageRepo.update.mockImplementation((_id, data) => Promise.resolve({ ...msgWithAtt, ...data }));
      const result = await service.editMessage('msg1', { content: 'edited' }, mockPJ);
      expect(result.content).toBe('edited');
      expect(result.attachments).toHaveLength(2);  // beze změny
      // patch nesmí obsahovat attachments
      const patch = mockMessageRepo.update.mock.calls[0][1];
      expect(patch).not.toHaveProperty('attachments');
    });
```

Note: `BadRequestException` musí být v importech v top of spec souboru. Pokud chybí, přidej:
```ts
import { ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
```

- [ ] **Step 7.2: Spustit testy — must FAIL**

Run: `cd backend && npx jest chat.service.spec --no-coverage`
Expected: FAIL — `editMessage` neumí attachments operace

- [ ] **Step 7.3: Přepsat editMessage**

V `chat.service.ts` najdi `async editMessage(...)` a celou metodu nahraď:

```ts
  async editMessage(messageId: string, dto: UpdateMessageDto, requester: RequestUser): Promise<ChatMessage> {
    const message = await this.messageRepo.findById(messageId);
    if (!message || message.isDeleted) throw new NotFoundException('Zpráva nenalezena');

    const canEdit = message.senderId === requester.id || (message.worldId && (await this.canManageChat(requester, message.worldId)));
    if (!canEdit) throw new ForbiddenException('Nedostatečná oprávnění');

    // Diff attachments
    let nextAttachments = message.attachments ?? [];
    const willMutateAttachments = !!(dto.attachmentsToAdd?.length || dto.attachmentsToRemove?.length);

    if (dto.attachmentsToRemove?.length) {
      const removeSet = new Set(dto.attachmentsToRemove);
      nextAttachments = nextAttachments.filter((a) => !removeSet.has(a.publicId));
    }
    if (dto.attachmentsToAdd?.length) {
      nextAttachments = [...nextAttachments, ...dto.attachmentsToAdd];
    }

    if (willMutateAttachments && nextAttachments.length > 10) {
      throw new BadRequestException('Maximum 10 attachmentů na zprávu');
    }

    // Sestavit patch — minimum 1 změna
    const patch: { content?: string; attachments?: typeof nextAttachments; isEdited: boolean } = { isEdited: true };
    if (dto.content !== undefined) patch.content = dto.content;
    if (willMutateAttachments) patch.attachments = nextAttachments;

    if (patch.content === undefined && patch.attachments === undefined) {
      throw new BadRequestException('Nutné upravit alespoň jedno pole');
    }

    const updated = await this.messageRepo.update(messageId, patch);
    if (!updated) throw new NotFoundException('Zpráva nenalezena');
    this.eventEmitter.emit('chat.message.updated', { channelId: message.channelId, message: updated });
    return updated;
  }
```

Note: import `BadRequestException` z `@nestjs/common` (pravděpodobně už importovaný).

- [ ] **Step 7.4: Spustit testy — must PASS**

Run: `cd backend && npx jest chat.service.spec --no-coverage`
Expected: PASS

Note: Existující test "should allow author to edit own message" očekává `content` v body, můj nový kód vrací 400 jen kdyby ANI content ANI attachments nebyly. S content existujícím přejde — ale ověř.

Existující test "should allow PJ to edit any message" — také projde (PJ canManageChat=true).

- [ ] **Step 7.5: Commit**

```bash
git add backend/src/modules/chat/chat.service.ts backend/src/modules/chat/chat.service.spec.ts
git commit -m "feat(chat): editMessage — diff-based attachment edit"
```

---

## Task 8: Final test sweep + roadmap update

**Files:**
- Modify: `docs/roadmap2.md`

- [ ] **Step 8.1: Spustit kompletní chat test suite**

Run: `cd backend && npx jest chat --no-coverage`
Expected: PASS všechny chat testy (chat.service, chat.controller, gateway pokud existují)

Pokud něco selže:
- Pravděpodobně mock objekt v dlouhých testech postrádá nový field. Doplň `customFont: null, color: null, isDiceRoll: false` (na ChatMessage) nebo `type: 'all'` (na ChatChannel).

- [ ] **Step 8.2: Build celého backendu**

Run: `cd backend && npm run build`
Expected: clean

- [ ] **Step 8.3: Aktualizovat roadmap2.md**

V `docs/roadmap2.md` najdi sekci `### 2.2 ChatMessage chybějící fields ⬜` a změň na:

```markdown
### 2.2 Chat fields ✅
**Hotovo 2026-05-05.** ChatChannel.type (volný string, default 'all'), ChatMessage customFont/color/isDiceRoll, soft-delete text "*Zpráva byla smazána autorem*", dice delete guard (jen PJ/PomocnýPJ + Admin/Superadmin), UpdateMessageDto diff-based attachments. Roadmap2 měl chybu — `type` patří na Channel, ne Message; opraveno.

- [x] Schema: ChatChannel.type, ChatMessage.customFont/color/isDiceRoll
- [x] DTO: CreateChannelDto/UpdateChannelDto + type, CreateMessageDto + customFont/color, UpdateMessageDto kompletně přepsán na diff (attachmentsToAdd/Remove)
- [x] sendMessage: dice detect (regex `🎲 HOD FATE` / `Hod Kostkou`), customFont/color propagace
- [x] deleteMessage: dice guard + soft-delete text
- [x] editMessage: diff attachments
- [x] Spec: dice detection, dice guard (Hrac/PJ/Admin/global chat), edit add/remove/kombinace, edit limity

Spec: [2026-05-05-chat-fields-design.md](superpowers/specs/2026-05-05-chat-fields-design.md)
Plán: [2026-05-05-chat-fields.md](superpowers/plans/2026-05-05-chat-fields.md)
```

V tabulce "Pořadí prací" změň řádek `| 4 | Fáze 2.2 — chat fields | klient blocker | 0,5 dne |` na:

```
| ✅ | Fáze 2.2 — chat fields | hotovo (2026-05-05) | — |
```

- [ ] **Step 8.4: Commit**

```bash
git add docs/roadmap2.md
git commit -m "docs(roadmap): Fáze 2.2 hotová — chat fields"
```

---

## Self-review checklist

Po dokončení všech tasků projeď:

- [ ] Spec coverage — schema, DTO, service změny pokrývají vše ze sekcí "Schema změny", "DTO změny", "Service změny" ve specu
- [ ] Všech 17 spec testů ze sekce "Spec testy" je v `chat.service.spec.ts`
- [ ] Build čistý: `cd backend && npm run build`
- [ ] Všechny chat testy prošly: `cd backend && npx jest chat --no-coverage`
- [ ] Klient nemůže overrideout `isDiceRoll` (test 5 v Task 5.1 to ověřuje)
- [ ] Soft-delete text je `'*Zpráva byla smazána autorem*'` (Task 6.3)
- [ ] Dice guard pokrývá global chat (worldId=null) — Admin OK, vlastník 403 (Task 6.1 testy)
- [ ] Edit prázdné body → 400 (Task 7.1)
- [ ] Edit součet >10 attachmentů → 400 (Task 7.1)
