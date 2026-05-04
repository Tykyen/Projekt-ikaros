export class UpdateDungeonMapDto {
  name?: string;
  gridType?: 'square' | 'hex';
  gridWidth?: number;
  gridHeight?: number;
  cellSize?: number;
  theme?: 'dyson' | 'modern';
  cells?: Record<string, unknown>[][];
  decorations?: Record<string, unknown>[];
}
