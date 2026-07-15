/**
 * Spec 20B (Příloha C) — enumy generického report & moderace subsystému.
 * Stringové hodnoty jsou kontrakt sdílený s FE (ReportModal / ContentReportRenderer).
 */

/** Typ nahlašitelného cíle — 19 ploch (veřejné B2 + soukromé B5 + knihovny Společné tvorby 21.5a–f + 21.2a + sdílené scény 22.5). */
export enum ReportTargetType {
  Article = 'article',
  Gallery = 'gallery',
  Profile = 'profile',
  Nabor = 'nabor',
  Bestie = 'bestie',
  DiscussionPost = 'discussion_post',
  Page = 'page',
  CharacterDiary = 'character_diary',
  WorldNews = 'world_news',
  ChatMessage = 'chat_message',
  MailMessage = 'mail_message',
  Plant = 'plant',
  Spell = 'spell',
  Potion = 'potion',
  Item = 'item',
  Riddle = 'riddle',
  PriceList = 'price_list',
  NameSet = 'name_set',
  // 22.5 — publikovaná šablona scény ve veřejném katalogu.
  SceneTemplate = 'scene_template',
}

/**
 * Kategorie hlášení (DSA čl. 16). `copyright` = takedown pro 20.3 (žádný druhý
 * formulář), `minor_safety` = CSAM (anonymní režim, jen Superadmin/Admin).
 */
export enum ReportCategory {
  Copyright = 'copyright',
  PersonalData = 'personal_data',
  Harassment = 'harassment',
  MinorSafety = 'minor_safety',
  Illegal = 'illegal',
  Spam = 'spam',
  Other = 'other',
}

/**
 * Moderační akce M0–M7 (provozní rámec 32-moderacni-matice).
 * M0–M4 = content-level (celý reviewer set), M5–M7 = account-level (jen Admin+).
 */
export enum ModerationAction {
  None = 'M0_none',
  Notice = 'M1_notice',
  HidePart = 'M2_hide_part',
  HideTemp = 'M3_hide_temp',
  Remove = 'M4_remove',
  RestrictAccount = 'M5_restrict',
  TerminateAccount = 'M6_terminate',
  EscalateExternal = 'M7_escalate',
}
