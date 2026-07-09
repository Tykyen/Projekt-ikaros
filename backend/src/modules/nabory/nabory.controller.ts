import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
  HttpCode,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { NaboryService } from './nabory.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CreateNaborDto } from './dto/create-nabor.dto';
import { PatchNaborDto } from './dto/patch-nabor.dto';
import { OzvatSeDto } from './dto/ozvat-se.dto';
import { UserRole } from '../users/interfaces/user.interface';

interface RequestUser {
  id: string;
  username: string;
  role: UserRole;
}

@ApiTags('Nábory')
@ApiBearerAuth()
@Controller('nabory')
@UseGuards(JwtAuthGuard)
export class NaboryController {
  constructor(private readonly service: NaboryService) {}

  @Get()
  @ApiOperation({ summary: 'Aktivní nábory (nástěnka)' })
  findAll(@CurrentUser() user: RequestUser) {
    // B4b — role rozhoduje, zda uživatel uvidí i moderačně skryté nábory.
    return this.service.findAll(user.role);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detail náboru' })
  findById(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.service.findById(id, user.role);
  }

  @Post()
  @ApiOperation({ summary: 'Vytvoření náboru' })
  create(@Body() dto: CreateNaborDto, @CurrentUser() user: RequestUser) {
    return this.service.create(dto, user.id, user.username);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Editace / stav náboru (autor nebo moderátor)' })
  patch(
    @Param('id') id: string,
    @Body() dto: PatchNaborDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.patch(id, dto, user.id, user.role);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Smazání (autor + Správce diskuzí + Admin + Superadmin)',
  })
  async delete(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    await this.service.delete(id, user.id, user.role);
  }

  @Post(':id/ozvat-se')
  @ApiOperation({ summary: 'Ozvat se autorovi (přímá zpráva)' })
  ozvatSe(
    @Param('id') id: string,
    @Body() dto: OzvatSeDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.ozvatSe(id, dto.message, user.id, user.username);
  }

  @Post(':id/report')
  @HttpCode(204)
  @ApiOperation({ summary: 'Nahlásit nábor (post-moderace)' })
  async report(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    await this.service.report(id, user.id);
  }
}
