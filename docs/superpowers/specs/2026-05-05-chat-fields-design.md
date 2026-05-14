# Chat fields — Design spec (Fáze 2.2)

**Datum:** 2026-05-05
**Status:** schváleno
**Souvisí:** Audit fáze 2.2 v [roadmap2.md](../../roadmap2.md), nedoběhlý plán [2026-05-05-krok-16b-feature-parity-implementation.md](../plans/2026-05-05-krok-16b-feature-parity-implementation.md) Task 7.

---

## Přehled

Doplnění chybějících polí na `ChatChannel` a `ChatMessage` schématech, oprava soft-delete textu, ochrana dice rollů před smazáním, a edit attachmentů přes diff. Většinou parity se starým systémem (`docs/old/chat-zpravy.md`, `docs/old/chat-kanaly.md`), částečně nové design rozhodnutí.

**Roadmap2 měl chybu:** uvedl `type` jako pole na ChatMessage. Reálně patří na **ChatChannel** (parita se starým systémem + `checklist-be.md`). Tento spec opravuje rozdělení.

---

## Schema změny

### ChatChannel

Přidat **jedno pole**:

```ts
@Prop({ type: String, default: 'all' })
type: string;
```

- **Volný řetězec, NEenum** — flexibilita pro PJ-created kanály
- **Konvenční hodnoty:**
  - `'all'` — pro všechny členy světa (default při auto-create)
  - `'group'` — per-skupina
  - `'dm'` — direct message hráč↔PJ
  - Legacy (Matrix svět): `'team_ic'`, `'team_ooc'`, `'team_pj'`, `'pj_dm'`, `'pj_group'`, `'inter'`
  - Custom: cokoliv si PJ vymyslí (`'kuchyne'`, `'plan'`, ...)
- **Validace:** `@IsString() @MaxLength(32)` v DTO
- **Žádná migrace** — existující channels bez fieldu dostanou Mongoose default `'all'` při čtení. Bulk migrace diskusí se řeší samostatně později.

### ChatMessage

Přidat **tři pole**:

```ts
@Prop({ type: String, default: null })
customFont: string | null;

@Prop({
  enum: ['red', 'blue', 'green', 'yellow', 'purple', 'orange', 'pink', 'cyan', 'default'],
  default: null,
  type: String,
})
color: string | null;

@Prop({ default: false })
isDiceRoll: boolean;
```

- **`customFont`** — volný string max 64 chars (parita se starým, frontend stylizuje podle hodnoty)
- **`color`** — preset paleta (9 hodnot včetně `default`), null = no styling
- **`isDiceRoll`** — boolean, **nastavuje backend** (klient nemůže overridenout). Detekce z `content`.

---

## Dice roll detekce

Backend v `sendMessage` aplikuje regex na `content` (pokud je zadán):

```ts
const DICE_REGEX = /^(🎲\s*HOD\s+FATE:|Hod\s+Kostkou)/i;

const isDiceRoll = dto.content ? DICE_REGEX.test(dto.content.trim()) : false;
```

Pokud match, uloží `isDiceRoll: true`. Klientův `isDiceRoll` v request body je **ignorovaný** (whitelisted out by ValidationPipe protože není v DTO).

---

## DTO změny

### `CreateChannelDto` + `UpdateChannelDto`

Přidat:
```ts
@IsOptional() @IsString() @MaxLength(32)
type?: string;
```

### `CreateMessageDto`

Přidat:
```ts
@IsOptional() @IsString() @MaxLength(64)
customFont?: string;

@IsOptional() @IsIn(['red','blue','green','yellow','purple','orange','pink','cyan','default'])
color?: string;
```

`isDiceRoll` v DTO **není** — backend ho odvodí.

### `UpdateMessageDto` — kompletně přepsat

Z aktuálního:
```ts
class UpdateMessageDto {
  @IsString() @MinLength(1) @MaxLength(4000)
  content: string;
}
```

Na:
```ts
class UpdateMessageDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(4000)
  content?: string;

  @IsOptional() @IsArray() @ValidateNested({ each: true }) @ArrayMaxSize(10)
  @Type(() => ChatAttachmentDto)
  attachmentsToAdd?: ChatAttachmentDto[];

  @IsOptional() @IsArray() @IsString({ each: true }) @ArrayMaxSize(20)
  attachmentsToRemove?: string[];   // publicId list (Cloudinary identifikátor)
}
```

Validace na úrovni service: musí být zadáno alespoň jedno pole. Jinak 400.

---

## Service změny

### `sendMessage` — dice detection

V `chat.service.ts` v metodě `sendMessage` (cca [chat.service.ts:228](../../../backend/src/modules/chat/chat.service.ts)) přidat dice detection před uložením:

```ts
const DICE_REGEX = /^(🎲\s*HOD\s+FATE:|Hod\s+Kostkou)/i;
const isDiceRoll = dto.content ? DICE_REGEX.test(dto.content.trim()) : false;

const message = await this.messageRepo.save({
  ...,
  isDiceRoll,
  customFont: dto.customFont ?? null,
  color: dto.color ?? null,
});
```

### `deleteMessage` — dice guard + soft-delete text

Aktuální stav (cca [chat.service.ts:341-351](../../../backend/src/modules/chat/chat.service.ts)):
```ts
async deleteMessage(messageId, requester) {
  const msg = await this.messageRepo.findById(messageId);
  if (!msg || msg.isDeleted) throw new NotFoundException(...);
  const canDelete = msg.senderId === requester.id || (msg.worldId && (await this.canManageChat(requester, msg.worldId)));
  if (!canDelete) throw new ForbiddenException(...);
  await this.messageRepo.update(messageId, { isDeleted: true, content: null });
  ...
}
```

Změnit na:
```ts
async deleteMessage(messageId, requester) {
  const msg = await this.messageRepo.findById(messageId);
  if (!msg || msg.isDeleted) throw new NotFoundException('Zpráva nenalezena');

  // Dice guard — kostky může mazat jen PJ/PomocnýPJ světa nebo globální Admin/Superadmin
  // (canManageChat sama dělá Admin bypass; pro global chat (worldId=null) ho dělám zvlášť)
  if (msg.isDiceRoll) {
    const allowed = msg.worldId
      ? await this.canManageChat(requester, msg.worldId)
      : requester.role <= UserRole.Admin;
    if (!allowed) {
      throw new ForbiddenException('Kostky může mazat jen PJ nebo Admin');
    }
  } else {
    // Standardní ownership check
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

**Pozn.:** Soft-delete text "*Zpráva byla smazána autorem*" se aplikuje stejně na obě varianty (vlastník i PJ moderation). Hard delete ani jiný text není v scope.

### `editMessage` — diff attachments

Aktuální stav (cca [chat.service.ts:328-339](../../../backend/src/modules/chat/chat.service.ts)):
```ts
async editMessage(messageId, dto, requester) {
  const message = await this.messageRepo.findById(messageId);
  if (!message || message.isDeleted) throw new NotFoundException(...);
  const canEdit = message.senderId === requester.id || (message.worldId && (await this.canManageChat(requester, message.worldId)));
  if (!canEdit) throw new ForbiddenException(...);
  const updated = await this.messageRepo.update(messageId, { content: dto.content, isEdited: true });
  ...
}
```

Změnit na:
```ts
async editMessage(messageId, dto, requester) {
  const message = await this.messageRepo.findById(messageId);
  if (!message || message.isDeleted) throw new NotFoundException('Zpráva nenalezena');

  const canEdit = message.senderId === requester.id || (message.worldId && (await this.canManageChat(requester, message.worldId)));
  if (!canEdit) throw new ForbiddenException('Nedostatečná oprávnění');

  // Diff attachments
  let nextAttachments = message.attachments ?? [];
  const willMutateAttachments = dto.attachmentsToAdd?.length || dto.attachmentsToRemove?.length;

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
  const patch: Partial<ChatMessage> = { isEdited: true };
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

**Pozn.:** `attachmentsToRemove` na neexistující `publicId` se tiše ignoruje (filter prostě nic neodebere). Odpovědnost klienta synchronizovat.

---

## Oprávnění

| Akce | Role |
|------|------|
| Create message s `customFont`/`color` | kdokoliv (svoboda formátování) |
| Edit `content` | vlastník nebo PJ/PomocnýPJ světa nebo Admin/Superadmin |
| Edit `attachmentsToAdd`/`attachmentsToRemove` | dtto |
| Soft-delete běžné zprávy | vlastník nebo PJ/PomocnýPJ světa nebo Admin/Superadmin |
| Soft-delete `isDiceRoll: true` zprávy | **jen** PJ/PomocnýPJ světa nebo Admin/Superadmin (vlastník-Hrac/Korektor 403) |
| Set `isDiceRoll` v body | nikdo (backend-only, klient nemůže) |
| Set `type` na channel | PJ/PomocnýPJ světa + Admin/Superadmin (jako stávající Channel CRUD) |

---

## Chybové stavy

| Stav | Kdy |
|------|-----|
| `400` | Edit s prázdným body, edit s celkem >10 attachmentů, channel/message DTO validation fail |
| `403` | Edit cizí zprávy bez PJ role, soft-delete dice rollu jako Hrac/Korektor (i vlastník), delete cizí běžné zprávy bez PJ role |
| `404` | Zpráva neexistuje, kanál neexistuje |

---

## Out of scope (fáze 2.2)

- **Default channel set** při create world (3 kanály: `all`/`group`/`dm`) — separátní task v jiné fázi
- **Hard delete dice rollů** — ani PJ to nemůže (záměrně, soft only)
- **Migrace existujících kanálů** (přidat `type` do DB) — uživatel rozhodl "v budoucnu, samostatný projekt"
- **Push notifikace per channel.type** — zmiňováno v roadmap.md, ne v scope tady
- **Type filter v ChannelMessages endpoint** — channel.type je fixed per kanál, filter nemá smysl
- **Whitelist enum pro customFont** — uživatel zvolil volný string

---

## Spec testy (povinné)

V `chat.service.spec.ts` (rozšíření existujících testů):

1. **Dice roll detection** — content `"🎲 HOD FATE: 6"` (s i bez whitespace) → `isDiceRoll: true`; běžný text → false
2. **Dice delete guard — Hrac** — Hrac vlastní `isDiceRoll: true` → **403**
3. **Dice delete jako PJ** — soft delete OK
4. **Dice delete jako PomocnýPJ** — soft delete OK
5. **Dice delete jako globální Admin** — soft delete OK i bez membership
5b. **Dice delete v global chatu (worldId=null) jako Admin** — soft delete OK
5c. **Dice delete v global chatu jako vlastník-Hrac** → 403
6. **Soft-delete content text** — po `deleteMessage` je `content === '*Zpráva byla smazána autorem*'` a `isDeleted === true`
7. **Edit jen content** — funguje, attachments beze změny
8. **Edit attachmentsToAdd** — přidá k existujícím (publicId nový)
9. **Edit attachmentsToRemove** — odebere podle publicId
10. **Edit add+remove kombinace** — funguje atomicky
11. **Edit překračující 10 attachmentů** → 400
12. **Edit prázdné body** (žádné pole z trojice) → 400
13. **CreateChannel s `type: 'kuchyne'`** — uloží volný řetězec
14. **CreateChannel bez type** — uloží default `'all'`
15. **CreateMessage s `color: 'red'` a `customFont`** — uloží do DB
16. **CreateMessage s `color: 'invalid'`** → 400 (ValidationPipe)
17. **CreateMessage s body `isDiceRoll: true`** — pole se whitelistuje pryč; backend rozhodne dle content

---

## Otevřené otázky

Žádné — všechna rozhodnutí jsou v sekcích výše nebo v "Out of scope".
