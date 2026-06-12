import { ArrayMaxSize, IsArray, IsString, Matches } from 'class-validator';

/**
 * 5.2-followup — body pro `PUT /users/me/favorite-pages/:worldId`.
 * `slugs` = úplný nový seznam slugů oblíbených stránek v daném světě
 * (replace-all; **pořadí pole = pořadí zobrazení**, reorder jde stejnou cestou).
 *
 * Sanity cap: 100 položek na svět (zdvojení s FE konstantou MAX_FAVORITE_PAGES).
 */
export class UpdateFavoritePagesDto {
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  // Slug stránky = lowercase ASCII + číslice + pomlčka (vzor `Page.slug`).
  @Matches(/^[a-z0-9][a-z0-9-]*$/, {
    each: true,
    message: 'Slug stránky musí být lowercase ASCII (a-z, 0-9, pomlčka)',
  })
  slugs!: string[];
}
