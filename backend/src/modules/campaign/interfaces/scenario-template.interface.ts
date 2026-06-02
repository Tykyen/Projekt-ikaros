/**
 * 11.2-ext E — Knihovna scén (šablony). Per-PJ, cross-world (jako MapTemplate).
 *
 * Snapshot scénáře BEZ per-svět runtime odkazů (subjectIds/bestieIds/
 * mapSceneIds/pageSlugs se do šablony nekopírují — jsou vázané na konkrétní
 * svět). Drží jen přenositelný obsah: název scény + `contentData.storyTree`
 * (text, tajná pole, mapa-podklad URL, legenda).
 */
export interface ScenarioTemplate {
  id: string;
  /** Per-PJ vlastnictví — server-side enforced (POST z auth user). */
  ownerId: string;
  /** Label šablony v knihovně. */
  name: string;
  /** Název scény, který se použije při vložení. */
  scenarioTitle: string;
  /** Očištěný `contentData` (storyTree bez per-svět ref). */
  contentData: Record<string, unknown>;
  createdAt?: Date;
  updatedAt?: Date;
}
