export const PAGE_TYPES = {
  Lokace: 'Lokace',
  Noviny: 'Noviny',
  Seznam: 'Seznam',
  Galerie: 'Galerie',
  Rodokmen: 'Rodokmen',
  Obrazovka: 'Obrazovka',
  Ostatni: 'Ostatní',
} as const;

export type PageType = typeof PAGE_TYPES[keyof typeof PAGE_TYPES];

export interface AccessRequirement {
  type: 'UserId' | 'AKJ' | 'Role';
  value: string;
}

export interface PageSection {
  id: string;
  title: string;
  content: string;
  order: number;
  isCollapsed: boolean;
  items: PageSectionItem[];
}

export interface PageSectionItem {
  id: string;
  text: string;
  quantity?: number;
  note?: string;
}

export interface GalleryImage {
  id: string;
  url: string;
  caption?: string;
  order: number;
}

export interface InstructionalVideo {
  id: string;
  title: string;
  youtubeUrl: string;
  youtubeVideoId: string;
}

export interface PageTable {
  hasTable: boolean;
  title?: string;
  headers?: string[];
  values?: string[];
}

export interface Page {
  id: string;
  slug: string;
  worldId: string;
  type: PageType;
  title: string;
  content: string;
  imageUrl?: string;
  bigImage?: boolean;
  table?: PageTable;
  sections: PageSection[];
  galleryImages: GalleryImage[];
  videos: InstructionalVideo[];
  accessRequirements: AccessRequirement[];
  customData?: Record<string, string>;
  order: number;
  createdAt: Date;
  updatedAt: Date;
}
