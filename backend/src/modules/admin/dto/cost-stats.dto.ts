/**
 * 19.2 — počítadla nákladů (jen měřit) pro admin dashboard. Tři vrstvy:
 * A počty blobů (odvozené z DB), B přesné byty kde je známe (chat + PDF),
 * C skutečný provoz Cloudinary (volitelné). Viz spec 19.2.
 * FE zrcadlo: `src/features/admin/api/costs.types.ts`.
 */

export interface CostBlobType {
  type: string;
  count: number;
}

export interface CostTopWorld {
  worldId: string;
  worldName: string;
  count: number;
}

export interface CostStats {
  generatedAt: string;
  blobs: {
    total: number;
    byType: CostBlobType[];
    topWorlds: CostTopWorld[];
  };
  measuredBytes: {
    chatAttachments: number;
    adminDocuments: number;
  };
  cloudinary: {
    available: boolean;
    storageBytes?: number;
    bandwidthBytes?: number;
    transformations?: number;
    credits?: { used: number; limit: number };
    plan?: string;
  };
  ai: { available: false };
}
