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
  updatedAt: Date;
}
