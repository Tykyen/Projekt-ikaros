export interface SearchResult {
  id: string;
  title: string;
  slug: string;
  score: number;
  providerKey: string;
  providerName: string;
}

export interface SearchProviderInfo {
  key: string;
  displayName: string;
}
