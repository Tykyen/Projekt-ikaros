import { IsIn } from 'class-validator';

/**
 * 15.11 — jak PJ naloží s návrhem obsahu:
 *  - `rework` = vrátit k přepracování (zůstane pending, autor doladí),
 *  - `discard` = zahodit (smazat stránku).
 */
export class RejectProposalDto {
  @IsIn(['rework', 'discard'])
  mode: 'rework' | 'discard';
}
