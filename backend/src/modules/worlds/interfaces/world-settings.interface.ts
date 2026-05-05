import type { SchemaBlock } from '../../characters/interfaces/character.interface';

export interface AkjType {
  key: string;
  name: string;
  level: number;
}

export interface MenuTemplateItem {
  label: string;
  href: string;
  order?: number;
}

export interface MenuTemplate {
  name: string;
  items: MenuTemplateItem[];
}

export interface HeadlineNode {
  id: string;
  label: string;
  isGroup: boolean;
  to?: string;
  children?: HeadlineNode[];
}

export interface WorldCurrencyItem {
  id: string;
  code: string;
  name: string;
  symbol: string;
  rate: number;
}

export interface WorldSettings {
  id: string;
  worldId: string;
  hiddenNavItems: string[];
  customGroups: string[];
  groupColors: Record<string, string>;
  customHeadline: HeadlineNode[];
  currencies: WorldCurrencyItem[];
  hideDefaultWeather: boolean;
  akjTypes: AkjType[];
  menuTemplates: MenuTemplate[];
  diarySchema: SchemaBlock[];
  calendarConfig?: Record<string, unknown>;
  updatedAt: Date;
}
