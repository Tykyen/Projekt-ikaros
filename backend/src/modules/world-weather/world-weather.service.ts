import {
  Injectable,
  Inject,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { IWeatherGeneratorRepository } from './interfaces/weather-generator-repository.interface';
import type {
  WeatherGenerator,
  WeatherGeneratorConfig,
} from './interfaces/weather-generator.interface';
import { CreateWeatherGeneratorDto } from './dto/create-weather-generator.dto';
import { UpdateWeatherGeneratorDto } from './dto/update-weather-generator.dto';
import { SetCurrentWeatherDto } from './dto/set-current-weather.dto';
import { BroadcastWeatherDto } from './dto/broadcast-weather.dto';
import type { IWorldMembershipRepository } from '../worlds/interfaces/world-membership-repository.interface';
import type { IWorldsRepository } from '../worlds/interfaces/worlds-repository.interface';
import { WorldRole } from '../worlds/interfaces/world-membership.interface';
import { UserRole } from '../users/interfaces/user.interface';
import { ChatService } from '../chat/chat.service';

export interface WeatherRequester {
  id: string;
  role: UserRole;
  username: string;
}

@Injectable()
export class WorldWeatherService {
  constructor(
    @Inject('IWeatherGeneratorRepository')
    private readonly repo: IWeatherGeneratorRepository,
    @Inject('IWorldMembershipRepository')
    private readonly membershipRepo: IWorldMembershipRepository,
    @Inject('IWorldsRepository')
    private readonly worldsRepo: IWorldsRepository,
    @Inject(ChatService)
    private readonly chatService: ChatService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async getAll(
    worldId: string,
    requester: WeatherRequester,
  ): Promise<WeatherGenerator[]> {
    await this.assertMember(worldId, requester);
    return this.repo.findByWorldId(worldId);
  }

  async getOne(
    worldId: string,
    id: string,
    requester: WeatherRequester,
  ): Promise<WeatherGenerator> {
    await this.assertMember(worldId, requester);
    const gen = await this.repo.findById(id);
    if (!gen || gen.worldId !== worldId)
      throw new NotFoundException('Generátor nenalezen');
    return gen;
  }

  async create(
    worldId: string,
    dto: CreateWeatherGeneratorDto,
    requester: WeatherRequester,
  ): Promise<WeatherGenerator> {
    await this.assertCanWrite(worldId, requester);
    this.validateConfig(dto.config as WeatherGeneratorConfig);
    return this.repo.save({
      worldId,
      name: dto.name,
      description: dto.description,
      config: dto.config as WeatherGeneratorConfig,
    });
  }

  async update(
    worldId: string,
    id: string,
    dto: UpdateWeatherGeneratorDto,
    requester: WeatherRequester,
  ): Promise<WeatherGenerator> {
    await this.assertCanWrite(worldId, requester);
    const gen = await this.repo.findById(id);
    if (!gen || gen.worldId !== worldId)
      throw new NotFoundException('Generátor nenalezen');
    if (dto.config) this.validateConfig(dto.config as WeatherGeneratorConfig);
    const updated = await this.repo.update(gen.id, {
      name: dto.name ?? gen.name,
      description: dto.description ?? gen.description,
      config: dto.config ? (dto.config as WeatherGeneratorConfig) : gen.config,
    });
    return updated!;
  }

  async remove(
    worldId: string,
    id: string,
    requester: WeatherRequester,
  ): Promise<boolean> {
    await this.assertCanWrite(worldId, requester);
    const gen = await this.repo.findById(id);
    if (!gen || gen.worldId !== worldId)
      throw new NotFoundException('Generátor nenalezen');
    return this.repo.delete(id);
  }

  private validateConfig(config: WeatherGeneratorConfig): void {
    if (config.tempMin > config.tempMax)
      throw new BadRequestException('tempMin musí být ≤ tempMax');
    if (config.windMin > config.windMax)
      throw new BadRequestException('windMin musí být ≤ windMax');
    if (config.pressureMin > config.pressureMax)
      throw new BadRequestException('pressureMin musí být ≤ pressureMax');
    if (config.humidityMin > config.humidityMax)
      throw new BadRequestException('humidityMin musí být ≤ humidityMax');
    if (config.windGustMultiplier < 1)
      throw new BadRequestException('windGustMultiplier musí být ≥ 1');
    if (config.weatherTypes && config.weatherTypes.length > 0) {
      const total = config.weatherTypes.reduce((s, t) => s + t.probability, 0);
      // Float arithmetic safety: tolerance ±0.01
      if (Math.abs(total - 100) > 0.01) {
        throw new BadRequestException(
          `Součet probability weatherTypes musí být 100, je ${total}`,
        );
      }
    }
  }

  /**
   * Read access: member světa (≥ Hrac, Pending vyloučen).
   * Neexistující svět = 404 (auth-required GET).
   */
  private async assertMember(
    worldId: string,
    requester: WeatherRequester,
  ): Promise<void> {
    if (requester.role <= UserRole.Admin) return;
    const world = await this.worldsRepo.findById(worldId);
    if (!world) throw new NotFoundException('Svět nenalezen');
    const membership = await this.membershipRepo.findByUserAndWorld(
      requester.id,
      worldId,
    );
    if (!membership) throw new ForbiddenException('Nejsi členem tohoto světa');
    if (membership.role < WorldRole.Hrac)
      throw new ForbiddenException('Pending členství nemá přístup');
  }

  /**
   * Write access: ≥ PomocnyPJ + Admin/Superadmin shortcut.
   * Neexistující svět = 404 (per .claude/rules/auth-leak-policy.md — auth-required).
   */
  private async assertCanWrite(
    worldId: string,
    requester: WeatherRequester,
  ): Promise<void> {
    if (requester.role <= UserRole.Admin) return;
    const world = await this.worldsRepo.findById(worldId);
    if (!world) throw new NotFoundException('Svět nenalezen');
    const membership = await this.membershipRepo.findByUserAndWorld(
      requester.id,
      worldId,
    );
    if (!membership || membership.role < WorldRole.PomocnyPJ)
      throw new ForbiddenException('Nedostatečná oprávnění');
  }

  async generate(
    worldId: string,
    id: string,
    requester: WeatherRequester,
  ): Promise<WeatherGenerator> {
    await this.assertCanWrite(worldId, requester);
    const gen = await this.repo.findById(id);
    if (!gen || gen.worldId !== worldId)
      throw new NotFoundException('Generátor nenalezen');
    const config = gen.config;

    const selectedType = this.weightedPick(config.weatherTypes);
    const temperature = this.randomBetween(config.tempMin, config.tempMax, 1);
    const cloudValue = Math.round(
      this.randomBetween(
        selectedType.cloudRange[0],
        selectedType.cloudRange[1],
        0,
      ),
    );
    const precipValue = this.randomBetween(
      selectedType.precipRange[0],
      selectedType.precipRange[1],
      1,
    );
    const windSpeed = Math.round(
      this.randomBetween(config.windMin, config.windMax, 0),
    );
    const windGusts = Math.round(windSpeed * config.windGustMultiplier);
    const pressureValue = Math.round(
      this.randomBetween(config.pressureMin, config.pressureMax, 0),
    );
    const humidity = Math.round(
      this.randomBetween(config.humidityMin, config.humidityMax, 0),
    );

    const extras = config.customFields
      .filter((cf) => Math.random() * 100 < cf.probability)
      .map((cf) => ({
        label: cf.label,
        value:
          cf.possibleValues[
            Math.floor(Math.random() * cf.possibleValues.length)
          ],
      }));

    const weather: import('./interfaces/weather-generator.interface').WeatherResult =
      {
        generatedAt: new Date(),
        isManual: false,
        temperature,
        tempUnit: config.tempUnit ?? 'C',
        weatherType: selectedType.label,
        weatherIcon: selectedType.type,
        cloudiness: this.cloudinessText(cloudValue),
        precipitation: this.precipitationText(precipValue),
        wind: { speed: windSpeed, gusts: windGusts, unit: 'kmh' },
        pressure: {
          value: pressureValue,
          trend: this.pressureTrend(pressureValue),
        },
        humidity,
        extras,
        narrativeText: null,
      };

    const updated = await this.repo.setCurrentWeather(gen.id, weather);
    return updated!;
  }

  async setCurrentWeather(
    worldId: string,
    id: string,
    dto: SetCurrentWeatherDto,
    requester: WeatherRequester,
  ): Promise<WeatherGenerator> {
    await this.assertCanWrite(worldId, requester);
    const gen = await this.repo.findById(id);
    if (!gen || gen.worldId !== worldId)
      throw new NotFoundException('Generátor nenalezen');
    const weather: import('./interfaces/weather-generator.interface').WeatherResult =
      {
        generatedAt: new Date(),
        isManual: true,
        temperature: dto.temperature,
        tempUnit: dto.tempUnit,
        weatherType: dto.weatherType,
        weatherIcon: dto.weatherIcon,
        cloudiness: dto.cloudiness,
        precipitation: dto.precipitation,
        wind: { ...dto.wind, unit: dto.wind.unit as 'kmh' },
        pressure: dto.pressure,
        humidity: dto.humidity,
        extras: dto.extras ?? [],
        narrativeText: dto.narrativeText,
      };
    const updated = await this.repo.setCurrentWeather(gen.id, weather);
    return updated!;
  }

  private weightedPick<T extends { probability: number }>(items: T[]): T {
    const total = items.reduce((s, i) => s + i.probability, 0);
    let rand = Math.random() * total;
    for (const item of items) {
      rand -= item.probability;
      if (rand <= 0) return item;
    }
    return items[items.length - 1];
  }

  private randomBetween(min: number, max: number, decimals: number): number {
    const val = min + Math.random() * (max - min);
    return parseFloat(val.toFixed(decimals));
  }

  private cloudinessText(value: number): {
    value: string;
    description: string;
  } {
    if (value === 0)
      return { value: '0/8 Jasno', description: 'Obloha bez mraků' };
    if (value <= 2)
      return {
        value: `${value}/8 Skoro jasno`,
        description: 'Ojedinělá oblačnost',
      };
    if (value <= 4)
      return {
        value: `${value}/8 Polojasno`,
        description: 'Proměnlivá oblačnost',
      };
    if (value <= 6)
      return {
        value: `${value}/8 Oblačno`,
        description: 'Převážně oblačno',
      };
    if (value === 7)
      return {
        value: '7/8 Převážně zataženo',
        description: 'Obloha z větší části zakrytá',
      };
    return { value: '8/8 Zataženo', description: 'Obloha úplně zakrytá' };
  }

  private precipitationText(mmPerHour: number): {
    value: string;
    description: string;
  } {
    if (mmPerHour === 0) return { value: 'Beze srážek', description: '' };
    if (mmPerHour <= 2)
      return {
        value: 'Slabé srážky',
        description: 'Mírný déšť nebo mrholení',
      };
    if (mmPerHour <= 10)
      return { value: 'Střední srážky', description: 'Pravidelný déšť' };
    return {
      value: 'Silné srážky',
      description: 'Intenzivní srážky nebo bouřka',
    };
  }

  private pressureTrend(hpa: number): string {
    // Per spec: >1015 = Stabilní, 1000-1015 = Mírný pokles, <1000 = Silný pokles.
    if (hpa > 1015) return 'Stabilní';
    if (hpa >= 1000) return 'Mírný pokles';
    return 'Silný pokles';
  }

  async broadcast(
    worldId: string,
    id: string,
    dto: BroadcastWeatherDto,
    requester: WeatherRequester,
  ): Promise<void> {
    await this.assertCanWrite(worldId, requester);
    const gen = await this.repo.findById(id);
    if (!gen || gen.worldId !== worldId)
      throw new NotFoundException('Generátor nenalezen');
    if (!gen.currentWeather) {
      throw new ConflictException(
        'Generátor nemá aktuální počasí. Nejdříve zavolejte /generate nebo /current.',
      );
    }

    const w = gen.currentWeather;
    if (dto.target === 'chat') {
      if (!dto.channelId)
        throw new BadRequestException(
          'channelId je povinný pro broadcast do chatu',
        );
      const content = this.formatWeatherForChat(gen.name, w);
      await this.chatService.createSystemMessage(
        dto.channelId,
        worldId,
        content,
        `Počasí — ${gen.name}`,
      );
    } else {
      this.eventEmitter.emit('weather.updated', {
        worldId,
        generatorId: gen.id,
        generatorName: gen.name,
        weather: w,
      });
    }
  }

  private formatWeatherForChat(
    generatorName: string,
    w: import('./interfaces/weather-generator.interface').WeatherResult,
  ): string {
    const lines = [
      `**${generatorName}** — ${w.weatherType}`,
      `Teplota: ${w.temperature > 0 ? '+' : ''}${w.temperature}°${w.tempUnit}`,
      `Oblačnost: ${w.cloudiness.value}`,
      `Srážky: ${w.precipitation.value}`,
      `Vítr: ${w.wind.speed} km/h (nárazy ${w.wind.gusts} km/h)`,
      `Tlak: ${w.pressure.value} hPa — ${w.pressure.trend} | Vlhkost: ${w.humidity}%`,
    ];
    if (w.extras.length > 0) {
      lines.push('');
      for (const extra of w.extras) {
        lines.push(
          `${extra.label}: ${extra.value}${extra.description ? ` — ${extra.description}` : ''}`,
        );
      }
    }
    if (w.narrativeText) {
      lines.push('');
      lines.push(w.narrativeText);
    }
    return lines.join('\n');
  }

  async seedDefaultForWorld(worldId: string, genre: string): Promise<void> {
    const config = this.defaultConfigForGenre(genre);
    await this.repo.save({ worldId, name: 'Výchozí prostředí', config });
  }

  private defaultConfigForGenre(genre: string): WeatherGeneratorConfig {
    const base: WeatherGeneratorConfig = {
      tempUnit: 'C',
      windMin: 0,
      windMax: 50,
      windGustMultiplier: 2.0,
      pressureMin: 980,
      pressureMax: 1030,
      humidityMin: 20,
      humidityMax: 90,
      customFields: [],
      weatherTypes: [
        {
          type: 'clear',
          label: 'Jasno',
          icon: 'clear',
          probability: 30,
          cloudRange: [0, 1],
          precipRange: [0, 0],
        },
        {
          type: 'cloudy',
          label: 'Zataženo',
          icon: 'cloudy',
          probability: 40,
          cloudRange: [5, 8],
          precipRange: [0, 0],
        },
        {
          type: 'rain',
          label: 'Déšť',
          icon: 'rain',
          probability: 20,
          cloudRange: [6, 8],
          precipRange: [1, 8],
        },
        {
          type: 'storm',
          label: 'Bouřka',
          icon: 'storm',
          probability: 10,
          cloudRange: [7, 8],
          precipRange: [8, 20],
        },
      ],
      tempMin: 0,
      tempMax: 25,
    };
    // Genre detection — pattern stejný jako WorldCurrenciesService.seedForWorld
    const fantasy = [
      'fantasy',
      'dark-fantasy',
      'heroic-fantasy',
      'sword-sorcery',
      'grimdark',
      'mytologicky',
    ];
    const cyber = [
      'cyberpunk',
      'sci-fi',
      'hard-sci-fi',
      'soft-sci-fi',
      'biopunk',
    ];
    const space = ['space-opera', 'military'];
    const postapo = ['postapo', 'post-postapo', 'dieselpunk'];

    if (fantasy.includes(genre)) {
      base.tempMin = -5;
      base.tempMax = 30;
    } else if (cyber.includes(genre)) {
      base.tempMin = -60;
      base.tempMax = 60;
      base.humidityMin = 0;
      base.humidityMax = 30;
    } else if (space.includes(genre)) {
      base.tempMin = -100;
      base.tempMax = 50;
      base.humidityMin = 0;
      base.humidityMax = 20;
    } else if (postapo.includes(genre)) {
      base.tempMin = -10;
      base.tempMax = 45;
      base.humidityMin = 5;
      base.humidityMax = 60;
    }
    return base;
  }
}
