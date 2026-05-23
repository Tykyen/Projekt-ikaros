import { ArrayMaxSize, IsArray, IsString, Matches } from 'class-validator';

/**
 * 8.3 / D-074 — body pro `PUT /users/me/favorite-characters/:worldId`.
 * `slugs` = úplný nový seznam slugů oblíbených postav v daném světě
 * (replace-all semantika; FE pošle aktuální stav po toggle).
 *
 * Sanity cap: 200 položek na svět (zdvojení s FE konstantou MAX_FAVORITES).
 */
export class UpdateFavoriteCharactersDto {
  @IsArray()
  @ArrayMaxSize(200)
  @IsString({ each: true })
  // Slug postavy = lowercase ASCII + číslice + pomlčka (vzor existujících `Character.slug` + `usernameLower`).
  @Matches(/^[a-z0-9][a-z0-9-]*$/, {
    each: true,
    message: 'Slug postavy musí být lowercase ASCII (a-z, 0-9, pomlčka)',
  })
  slugs!: string[];
}
