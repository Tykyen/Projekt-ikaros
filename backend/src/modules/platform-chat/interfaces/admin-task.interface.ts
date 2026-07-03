/** 20.5 — úkol admina v panelu „Úkoly týmu". */
export interface AdminTask {
  id: string;
  /** userId vlastníka úkolu (v čí koloně visí). */
  ownerId: string;
  ownerName: string;
  text: string;
  done: boolean;
  order: number;
  /** Kdo úkol založil (owner sám, nebo superadmin cizímu). */
  createdBy: string;
  createdAt: Date;
}
