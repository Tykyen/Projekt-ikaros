import { IsIn } from 'class-validator';
import type { RoomStyle } from '../global-chat.gateway';

/**
 * Spec 16.6a — admin přepis defaultního žánru Campu (`PUT rooms/:room/default`).
 * Jen `style`; `room` je v cestě. Trvalé přerozdělení (perzistentní), rotace ho
 * respektuje od dalšího okna.
 */
export class SetRoomDefaultDto {
  @IsIn(['fantasy', 'scifi', 'mystic'])
  style: RoomStyle;
}
