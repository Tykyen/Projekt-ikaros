import { Body, Controller, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { WorldCurrenciesService } from './world-currencies.service';
import { UpdateWorldCurrenciesDto } from './dto/update-world-currencies.dto';
import { ConvertCurrencyDto } from './dto/convert-currency.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { CurrencyRequester } from './world-currencies.service';

@Controller('worlds')
export class WorldCurrenciesController {
  constructor(private readonly service: WorldCurrenciesService) {}

  @Get(':worldId/currencies')
  @UseGuards(JwtAuthGuard)
  getCurrencies(@Param('worldId') worldId: string, @CurrentUser() user: { id: string }) {
    return this.service.getCurrencies(worldId, user.id);
  }

  @Put(':worldId/currencies')
  @UseGuards(JwtAuthGuard)
  updateCurrencies(
    @Param('worldId') worldId: string,
    @Body() dto: UpdateWorldCurrenciesDto,
    @CurrentUser() user: CurrencyRequester,
  ) {
    return this.service.updateCurrencies(worldId, dto.items as never, user);
  }

  @Post(':worldId/currencies/convert')
  @UseGuards(JwtAuthGuard)
  convert(@Param('worldId') worldId: string, @Body() dto: ConvertCurrencyDto, @CurrentUser() user: { id: string }) {
    return this.service.convert(worldId, dto, user.id);
  }
}
