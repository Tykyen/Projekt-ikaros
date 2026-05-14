import type {
  WorldCalendarConfig,
  CelestialBody,
  CelestialState,
  CelestialOverride,
  MoonConfig,
  SunConfig,
  PlanetConfig,
  CometConfig,
  OtherConfig,
} from './interfaces/world-calendar-config.interface';

export function totalDaysPerYear(
  config: Pick<WorldCalendarConfig, 'months'>,
): number {
  return config.months.reduce((sum, m) => sum + m.daysCount, 0);
}

export function absoluteDay(
  year: number,
  month: number,
  day: number,
  config: Pick<WorldCalendarConfig, 'months'>,
): number {
  const yearDays = totalDaysPerYear(config);
  const daysBeforeMonth = config.months
    .slice(0, month - 1)
    .reduce((sum, m) => sum + m.daysCount, 0);
  return year * yearDays + daysBeforeMonth + day;
}

function getReferenceOffset(body: CelestialBody, yearDays: number): number {
  const { type, config: cfg, referenceState } = body;
  if (type === 'moon') {
    const c = cfg as MoonConfig;
    const idx = Math.max(0, c.phases.indexOf(referenceState));
    return idx * (c.cycleLength / c.phases.length);
  }
  if (type === 'other') {
    const c = cfg as OtherConfig;
    const idx = Math.max(0, c.states.indexOf(referenceState));
    return idx * (c.cycleLength / c.states.length);
  }
  if (type === 'planet') {
    const c = cfg as PlanetConfig;
    const idx = Math.max(0, c.constellations.indexOf(referenceState));
    return idx * (c.orbitalPeriod / c.constellations.length);
  }
  if (type === 'comet') {
    const c = cfg as CometConfig;
    const apparitionDays = c.apparitionDurationYears * yearDays;
    return referenceState === 'viditelná' ? 0 : apparitionDays;
  }
  return 0; // sun
}

function calculateBodyState(
  body: CelestialBody,
  delta: number,
  yearDays: number,
  month: number,
): string {
  const refOffset = getReferenceOffset(body, yearDays);
  const { type, config: cfg } = body;

  if (type === 'moon') {
    const c = cfg as MoonConfig;
    const pos =
      (((delta + refOffset) % c.cycleLength) + c.cycleLength) % c.cycleLength;
    const idx = Math.floor(pos / (c.cycleLength / c.phases.length));
    return c.phases[Math.min(idx, c.phases.length - 1)];
  }
  if (type === 'other') {
    const c = cfg as OtherConfig;
    const pos =
      (((delta + refOffset) % c.cycleLength) + c.cycleLength) % c.cycleLength;
    const idx = Math.floor(pos / (c.cycleLength / c.states.length));
    return c.states[Math.min(idx, c.states.length - 1)];
  }
  if (type === 'planet') {
    const c = cfg as PlanetConfig;
    const deg =
      ((((delta + refOffset) % c.orbitalPeriod) / c.orbitalPeriod) * 360 +
        360) %
      360;
    const idx = Math.floor(deg / (360 / c.constellations.length));
    return c.constellations[Math.min(idx, c.constellations.length - 1)];
  }
  if (type === 'comet') {
    const c = cfg as CometConfig;
    const totalPeriodDays = c.periodYears * yearDays;
    const apparitionDays = c.apparitionDurationYears * yearDays;
    const pos =
      (((delta + refOffset) % totalPeriodDays) + totalPeriodDays) %
      totalPeriodDays;
    return pos < apparitionDays ? 'viditelná' : 'neviditelná';
  }
  if (type === 'sun') {
    const c = cfg as SunConfig;
    const rise = c.riseHour[month - 1] ?? c.riseHour[0];
    const set = c.setHour[month - 1] ?? c.setHour[0];
    return `vychod: ${rise}:00, zapad: ${set}:00`;
  }
  return '';
}

export function calculateCelestialStates(
  year: number,
  month: number,
  day: number,
  config: WorldCalendarConfig,
  overrides: CelestialOverride[],
): CelestialState[] {
  if (!config.referenceDate || config.celestialBodies.length === 0) return [];

  const yearDays = totalDaysPerYear(config);
  const refDay = absoluteDay(
    config.referenceDate.year,
    config.referenceDate.month,
    config.referenceDate.day,
    config,
  );
  const targetDay = absoluteDay(year, month, day, config);
  const delta = targetDay - refDay;

  return config.celestialBodies.map((body) => {
    const override = overrides.find((o) => o.bodyId === body.id);
    if (override) {
      return {
        bodyId: body.id,
        name: body.name,
        type: body.type,
        state: override.value,
        isManualOverride: true,
      };
    }
    const state = calculateBodyState(body, delta, yearDays, month);
    return {
      bodyId: body.id,
      name: body.name,
      type: body.type,
      state,
      isManualOverride: false,
    };
  });
}
