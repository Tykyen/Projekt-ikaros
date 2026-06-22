import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  Query,
  BadRequestException,
  ForbiddenException,
  UseGuards,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';
import {
  GlobalChatService,
  isRoomKey,
  type RoomKey,
} from './global-chat.service';
import { GlobalChatGateway } from './global-chat.gateway';
import { CreateGlobalMessageDto } from './dto/create-global-message.dto';
import { SetRoomEnvironmentDto } from './dto/set-room-environment.dto';
import { AnonBanDto } from './dto/anon-ban.dto';
import { AnonBanService } from './anon-ban.service';
import { GuestOrMemberGuard } from '../../common/guards/guest-or-member.guard';
import { AdminGuard } from '../../common/guards/admin.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '../users/interfaces/user.interface';
import type { RequestUser } from '../worlds/worlds.service';
import { UploadService } from '../upload/upload.service';

/** Max velikost přílohy chatu — 10 MB (spec 4.3b). */
const ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;

/** Role s platformovou funkcí — smí měnit prostředí Rozcestí (spec 4.2a §4.3). */
const ROOM_STAFF_ROLES = [
  UserRole.Superadmin,
  UserRole.Admin,
  UserRole.SpravceClanku,
  UserRole.SpravceGalerie,
  UserRole.SpravceDiskuzi,
];

/** Query `?room=` → RoomKey; default Hospoda (zpětná kompatibilita 4.1). */
function parseRoom(raw?: string): RoomKey {
  if (raw === undefined) return 'hospoda';
  if (!isRoomKey(raw)) {
    throw new BadRequestException({
      code: 'UNKNOWN_CHAT_ROOM',
      message: `Neznámá místnost '${raw}'`,
    });
  }
  return raw;
}

@ApiTags('Global Chat')
@ApiBearerAuth()
@Controller('global-chat')
// 15.8 — GuestOrMemberGuard pustí člena (plný member gate) i hosta (guest JWT).
// Scope hosta na Hospodu hlídá `assertGuestScope` níže; upload/delete/PUT
// environment hosta odmítnou (guest block / AdminGuard / RolesGuard sentinel).
@UseGuards(GuestOrMemberGuard)
export class GlobalChatController {
  constructor(
    private readonly globalChatService: GlobalChatService,
    private readonly globalChatGateway: GlobalChatGateway,
    private readonly uploadService: UploadService,
    private readonly anonBanService: AnonBanService,
  ) {}

  /** 15.8 — host (guest) smí jen Hospodu; jiná místnost → 403. */
  private assertGuestScope(user: RequestUser, key: RoomKey): void {
    if (user.isGuest && key !== 'hospoda') {
      throw new ForbiddenException({
        code: 'GUEST_HOSPODA_ONLY',
        message: 'Host (anonym) smí jen Hospodu.',
      });
    }
  }

  @Get('room-info')
  @ApiOperation({
    summary: 'Info o místnosti — channelId + seznam přítomných uživatelů',
  })
  @ApiResponse({ status: 200, description: 'Info o místnosti' })
  getRoomInfo(@CurrentUser() user: RequestUser, @Query('room') room?: string) {
    const key = parseRoom(room);
    this.assertGuestScope(user, key);
    return {
      channelId: this.globalChatService.getChannelId(key),
      users: this.globalChatGateway.getPresence(key),
    };
  }

  @Get('rooms/presence')
  @ApiOperation({
    summary: 'Počet přítomných uživatelů pro každou místnost (pro navigaci)',
  })
  @ApiResponse({ status: 200, description: 'Mapa room → počet' })
  getRoomPresenceCounts() {
    return this.globalChatGateway.getRoomCounts();
  }

  @Get('messages')
  @ApiOperation({
    summary: 'Historie zpráv globálního chatu (posledních 60 min)',
  })
  @ApiResponse({ status: 200, description: 'Seznam zpráv' })
  getMessages(
    @CurrentUser() user: RequestUser,
    @Query('room') room?: string,
    @Query('before') before?: string,
    @Query('limit') limit?: string,
  ) {
    const key = parseRoom(room);
    this.assertGuestScope(user, key);
    return this.globalChatService.getMessages(key, user.id, {
      before,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Post('messages')
  @ApiOperation({ summary: 'Odeslání zprávy do globálního chatu' })
  @ApiResponse({ status: 201, description: 'Zpráva odeslána' })
  sendMessage(
    @Body() dto: CreateGlobalMessageDto,
    @CurrentUser() user: RequestUser,
    @Query('room') room?: string,
  ) {
    const key = parseRoom(room);
    this.assertGuestScope(user, key);
    return this.globalChatService.sendMessage(key, dto, user);
  }

  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: ATTACHMENT_MAX_BYTES },
    }),
  )
  @ApiOperation({
    summary: 'Nahrání přílohy globálního chatu (obrázek/dokument, max 10 MB)',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiResponse({ status: 201, description: 'Nahraná příloha (ChatAttachment)' })
  @ApiResponse({ status: 415, description: 'Nepodporovaný typ souboru' })
  uploadAttachment(
    @CurrentUser() user: RequestUser,
    @UploadedFile() file: Express.Multer.File,
    @Query('room') room?: string,
  ) {
    // 15.8 — host (anonym) nemá upload příloh (R4 — jen text).
    if (user.isGuest) {
      throw new ForbiddenException({
        code: 'GUEST_NO_UPLOAD',
        message: 'Host (anonym) nemůže nahrávat soubory.',
      });
    }
    if (!file) {
      throw new BadRequestException({
        code: 'UPLOAD_FILE_REQUIRED',
        message: 'Soubor je povinný',
      });
    }
    return this.uploadService.uploadGlobalChatFile(file, parseRoom(room));
  }

  @Delete('messages/:messageId')
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Smazání zprávy (Admin/Superadmin)' })
  @ApiResponse({ status: 204, description: 'Zpráva smazána' })
  @ApiResponse({ status: 403, description: 'Nedostatečná oprávnění' })
  deleteMessage(
    @Param('messageId') messageId: string,
    @Query('room') room?: string,
  ) {
    return this.globalChatService.deleteMessage(parseRoom(room), messageId);
  }

  // 15.8 — Admin zabanuje hosta (anonyma) podle anon-id. Zabanovaný host už
  // v Hospodě nenapíše (global-chat.service ANON_BANNED), dokud si nesmaže cookie.
  @Post('anon-ban')
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Zabanovat hosta (anonyma) v Hospodě (Admin)' })
  @ApiResponse({ status: 201, description: 'Host zabanován' })
  @ApiResponse({ status: 403, description: 'Nedostatečná oprávnění' })
  banAnon(@Body() dto: AnonBanDto, @CurrentUser() admin: RequestUser) {
    return this.anonBanService.ban(dto.anonId, admin.id);
  }

  // ── Prostředí Rozcestí (krok 4.2a) ─────────────────────────────────────
  @Get('rooms/:room/environment')
  @ApiOperation({ summary: 'Aktuální prostředí místnosti (styl + lokace)' })
  @ApiResponse({ status: 200, description: 'Prostředí místnosti' })
  getRoomEnvironment(@Param('room') room: string) {
    return this.globalChatGateway.getEnvironment(parseRoom(room));
  }

  @Put('rooms/:room/environment')
  @UseGuards(RolesGuard)
  @Roles(...ROOM_STAFF_ROLES)
  @ApiOperation({
    summary: 'Změna prostředí Rozcestí (jen role s platformovou funkcí)',
  })
  @ApiResponse({ status: 200, description: 'Prostředí změněno + WS broadcast' })
  @ApiResponse({ status: 403, description: 'Nedostatečná oprávnění' })
  setRoomEnvironment(
    @Param('room') room: string,
    @Body() dto: SetRoomEnvironmentDto,
  ) {
    return this.globalChatGateway.setEnvironment(parseRoom(room), dto);
  }
}
