import type { PageSection } from '../../pages/interfaces/page.interface';

export interface CharacterInventory {
  id: string;
  characterId: string;
  isHidden: boolean;
  sections: PageSection[];
}
