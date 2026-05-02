# Krok 3c-upload — File Upload: Design

> **Pro agentické workery:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development nebo superpowers:executing-plans pro implementaci tohoto plánu task-by-task.

**Cíl:** Přidat podporu pro nahrávání souborů (obrázky, GIFy, videa, dokumenty) do chat zpráv přes Cloudinary.

**Architektura:** Nový `UploadModule` s vlastním controllerem a service. Soubory se nahrávají přes NestJS backend (Multer memoryStorage) na Cloudinary. `ChatMessage` se rozšíří o `attachments` field. `content` se stane volitelným — zpráva může obsahovat jen přílohu.

**Tech stack:** NestJS 11, Mongoose 9, Multer (součást @nestjs/platform-express), cloudinary npm, class-validator

---

## Datový model

### ChatAttachment — nový subdokument

```typescript
interface ChatAttachment {
  url: string;        // Cloudinary delivery URL
  publicId: string;   // Cloudinary public ID (pro mazání)
  type: 'image' | 'video' | 'document';
  mimeType: string;   // 'image/jpeg', 'video/mp4', 'application/pdf' ...
  filename: string;   // původní název souboru (sanitizovaný)
  size: number;       // velikost v bytech
}
```

### ChatMessage — rozšíření

K existujícím fieldům přibyde:

```typescript
attachments?: ChatAttachment[];  // max 10 příloh na zprávu
```

`content` zůstane `string | null`, ale v `CreateMessageDto` se stane `@IsOptional()`. Alespoň jedno z `content` nebo `attachments` musí být vyplněno (validace v service: `BadRequestException` pokud oboje chybí).

---

## Cloudinary konfigurace

Složka pro soubory: `chat/{worldId}/{channelId}/`

Transformace při uploadu:
- **Obrázky** (`image/*`): `quality: auto`, `fetch_format: auto` — automatická optimalizace
- **Videa** (`video/*`): bez transformací — uloží se tak jak jsou
- **Dokumenty**: `resource_type: raw` — Cloudinary je uloží jako raw soubory

Env proměnné:
```
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
```

---

## REST API

### POST /api/upload

Nahraje soubor na Cloudinary a vrátí metadata.

**Request:** `multipart/form-data`
- `file` — soubor (required)
- `channelId` — ID kanálu (required) — pro ověření přístupu

**Response `201`:**
```json
{
  "url": "https://res.cloudinary.com/demo/image/upload/v1/chat/world1/ch1/abc123.jpg",
  "publicId": "chat/world1/ch1/abc123",
  "type": "image",
  "mimeType": "image/jpeg",
  "filename": "mapa.jpg",
  "size": 2048000
}
```

**Validace:**
- Uživatel musí mít přístup ke kanálu (`ChatService.hasChannelAccess`) → `403 ForbiddenException`
- Kanál musí existovat → `404 NotFoundException`
- Max velikost: **50 MB** (Multer limits)
- Povolené MIME typy (whitelist):
  - Obrázky: `image/jpeg`, `image/png`, `image/gif`, `image/webp`, `image/svg+xml`
  - Videa: `video/mp4`, `video/webm`, `video/quicktime`
  - Dokumenty: `application/pdf`, `text/plain`, `text/markdown`, `application/msword`, `application/vnd.openxmlformats-officedocument.wordprocessingml.document`
- Nepovolený MIME typ → `415 UnsupportedMediaTypeException`
- Chyba Cloudinary → `502 BadGatewayException`

### Rozšíření POST /api/channels/:channelId/messages

`CreateMessageDto` se rozšíří:

```typescript
class CreateMessageDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(4000)
  content?: string;

  // ... existující fieldy (rpDate, replyToId, visibleTo, overrideName, overrideAvatarUrl) ...

  @IsOptional() @IsArray() @ValidateNested({ each: true }) @ArrayMaxSize(10) @Type(() => ChatAttachmentDto)
  attachments?: ChatAttachmentDto[];
}

class ChatAttachmentDto {
  @IsUrl() url: string;
  @IsString() @MaxLength(512) publicId: string;
  @IsIn(['image', 'video', 'document']) type: string;
  @IsString() @MaxLength(128) mimeType: string;
  @IsString() @MaxLength(255) filename: string;
  @IsInt() @Min(1) @Max(52428800) size: number;  // max 50 MB
}
```

---

## Struktura souborů — nové a upravené

```
backend/src/
├── modules/
│   ├── upload/                          ← NOVÝ modul
│   │   ├── upload.module.ts
│   │   ├── upload.controller.ts         ← POST /upload
│   │   ├── upload.service.ts            ← Cloudinary SDK wrapper
│   │   └── dto/
│   │       └── upload-response.dto.ts
│   │
│   └── chat/
│       ├── interfaces/
│       │   ├── chat-message.interface.ts      ← + attachments field + ChatAttachment interface
│       │   └── chat-attachment.interface.ts   ← nový interface
│       ├── schemas/
│       │   └── chat-message.schema.ts         ← + attachments subdocument array
│       ├── repositories/
│       │   └── chat-message.repository.ts     ← + toEntity mapuje attachments
│       ├── dto/
│       │   ├── create-message.dto.ts           ← content volitelné + attachments field
│       │   └── chat-attachment.dto.ts          ← nový DTO
│       └── chat.service.ts                    ← validace content || attachments
│
└── app.module.ts                              ← + UploadModule
```

---

## Oprávnění

| Akce | Kdo může |
|------|----------|
| Nahrát soubor | Kdokoliv kdo má přístup ke kanálu |
| Odeslat zprávu s přílohou | Kdokoliv kdo může psát do kanálu |
| Smazat soubor z Cloudinary | Automaticky při soft delete zprávy (async, best-effort) |

**Mazání souborů:** Při soft delete zprávy (`deleteMessage`) se spustí async Cloudinary delete pro každý `publicId` v `attachments`. Chyba při mazání se pouze loguje — nezablokuje smazání zprávy.

---

## Modulové závislosti

`UploadModule` importuje `ChatModule`. `ChatModule` musí exportovat `ChatService` (přidat do `exports` v `chat.module.ts`).

---

## Dependencies

Nové npm balíčky:
```
cloudinary          ← Cloudinary Node.js SDK
@types/multer       ← TypeScript typy pro Multer (multer je součástí @nestjs/platform-express)
```

---

## Co není součástí 3c-upload

- Thumbnail generování pro videa (odloženo)
- Progress bar pro upload (frontend věc)
- Bulk upload více souborů najednou (max 10 příloh přes attachments[], každá nahrána zvlášť)
- Interdimenzionální hospoda / cross-world chat (odloženo na 3c-crossworld)
