import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { WorldRole } from '../interfaces/world-membership.interface';

export type WorldInviteDocument = HydratedDocument<WorldInviteSchemaClass>;

/**
 * 15.10 fáze B — pozvánka do světa. Dvě cesty jednou entitou:
 *  - `kind='user'` — cílená pozvánka konkrétního uživatele (`invitedUserId`);
 *    objeví se pozvanému v „ke zpracování", přijme → membership Čtenář.
 *  - `kind='link'` — pozvací odkaz (`token` + expirace/limit); kdokoli s
 *    odkazem se přihlášený přidá (pre-approved) → membership Čtenář.
 *
 * Souhlas příjemce je vždy vyžadován (user: klik Přijmout; link: klik na URL).
 */
@Schema({ timestamps: true, collection: 'worldinvites' })
export class WorldInviteSchemaClass {
  @Prop({ required: true }) worldId: string;
  @Prop({ required: true, enum: ['user', 'link'] }) kind: 'user' | 'link';
  @Prop() invitedUserId?: string;
  @Prop() token?: string;
  @Prop({ required: true }) createdBy: string;
  @Prop({ required: true, default: WorldRole.Ctenar }) role: number;
  @Prop({
    required: true,
    default: 'pending',
    enum: ['pending', 'accepted', 'declined', 'revoked', 'expired'],
  })
  status: string;
  @Prop() expiresAt?: Date;
  @Prop() maxUses?: number;
  @Prop({ default: 0 }) usedCount: number;
}

export const WorldInviteSchema = SchemaFactory.createForClass(
  WorldInviteSchemaClass,
);

// Max 1 aktivní (pending) cílená pozvánka na (svět, uživatel).
WorldInviteSchema.index(
  { worldId: 1, invitedUserId: 1 },
  {
    unique: true,
    partialFilterExpression: { status: 'pending', kind: 'user' },
  },
);
// Token odkazu je unikátní (sparse — user-invites token nemají).
WorldInviteSchema.index({ token: 1 }, { unique: true, sparse: true });
// Fronta „ke zpracování" pozvaného + přehled aktivních pozvánek světa.
WorldInviteSchema.index({ invitedUserId: 1, status: 1 });
WorldInviteSchema.index({ worldId: 1, status: 1 });
