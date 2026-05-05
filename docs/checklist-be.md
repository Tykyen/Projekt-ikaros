# Checklist BE — Feature Parity

> Generováno: 2026-05-05T12:43:19.141Z  
> Starý backend: `C:\Matrix\Matrix\backend`  
> Nový backend: `backend/src`  
> ✅ pokryto | ❌ chybí | ⚠️ přejmenováno | ➕ jen v novém

---

## Souhrn

| Dimenze | Starý | Pokryto | Přejmenováno | Chybí | Navíc | Stav |
|---------|-------|---------|-------------|-------|-------|------|
| REST endpointy | 216 | 78 | 0 | 138 | 154 | ❌ |
| WebSocket události | 45 | 0 | — | 45 | 51 | ❌ |
| MongoDB schémata | 19 | 0 | — | 19 | 41 | ❌ |
| Cron joby | 1 | 0 | — | 1 | 0 | ❌ |
| JWT claims | 0 | 0 | — | 0 | 6 | ✅ |

---

## REST endpointy

### ❌ Chybějící endpointy

- `POST /api/auth/refresh/{id}`
- `GET /api/calenders`
- `GET /api/calenders/{slug}`
- `POST /api/calenders`
- `PUT /api/calenders/{slug}`
- `POST /api/calenders/fix-orphan`
- `DELETE /api/calenders/{slug}`
- `GET /api/characters`
- `GET /api/characters/{slug}`
- `GET /api/characters`
- `POST /api/characters`
- `PUT /api/characters`
- `DELETE /api/characters`
- `GET /api/chat/channels`
- `POST /api/chat/channels`
- `GET /api/chat/channels/{id}`
- `PUT /api/chat/channels/{id}`
- `DELETE /api/chat/channels/{id}`
- `GET /api/chat/groups`
- `POST /api/chat/groups`
- `PUT /api/chat/groups/{id}`
- `DELETE /api/chat/groups/{id}`
- `GET /api/chat/messages/{channelId}`
- `POST /api/chat/messages`
- `POST /api/chat/messages/read/{channelId}`
- `PUT /api/chat/messages/{id}`
- `DELETE /api/chat/messages/{id}`
- `POST /api/chat/messages/{id}/react`
- `GET /api/events`
- `GET /api/events/{id}`
- `POST /api/events`
- `PUT /api/events/{id}`
- `DELETE /api/events/{id}`
- `POST /api/events/{id}/confirm`
- `GET /api/ikarosarticles`
- `GET /api/ikarosarticles/my`
- `GET /api/ikarosarticles/pending`
- `GET /api/ikarosarticles/{id}`
- `POST /api/ikarosarticles`
- `PUT /api/ikarosarticles/{id}`
- `POST /api/ikarosarticles/{id}/submit`
- `POST /api/ikarosarticles/{id}/approve`
- `POST /api/ikarosarticles/{id}/reject`
- `POST /api/ikarosarticles/{id}/rate`
- `GET /api/ikarosarticles/stats`
- `DELETE /api/ikarosarticles/{id}`
- `GET /api/ikaros-chat/room-info`
- `GET /api/ikarosdiscussions`
- `GET /api/ikarosdiscussions/pending`
- `GET /api/ikarosdiscussions/{id}`
- `POST /api/ikarosdiscussions`
- `PATCH /api/ikarosdiscussions/{id}`
- `POST /api/ikarosdiscussions/{id}/approve`
- `POST /api/ikarosdiscussions/{id}/reject`
- `POST /api/ikarosdiscussions/{id}/invite`
- `GET /api/ikarosdiscussions/{id}/posts`
- `POST /api/ikarosdiscussions/{id}/posts`
- `DELETE /api/ikarosdiscussions/{id}/posts/{postId}`
- `POST /api/ikarosdiscussions/{id}/toggle-favorite`
- `GET /api/ikarosdiscussions/my-favorites`
- `GET /api/ikarosgallery`
- `GET /api/ikarosgallery/my`
- `GET /api/ikarosgallery/pending`
- `GET /api/ikarosgallery/{id}`
- `POST /api/ikarosgallery`
- `PUT /api/ikarosgallery/{id}`
- `POST /api/ikarosgallery/{id}/submit`
- `POST /api/ikarosgallery/{id}/approve`
- `POST /api/ikarosgallery/{id}/reject`
- `POST /api/ikarosgallery/{id}/rate`
- `GET /api/ikarosgallery/stats`
- `DELETE /api/ikarosgallery/{id}`
- `GET /api/ikarosmessages/inbox`
- `GET /api/ikarosmessages/sent`
- `GET /api/ikarosmessages/unread-count`
- `GET /api/ikarosmessages/{id}`
- `POST /api/ikarosmessages`
- `DELETE /api/ikarosmessages/{id}`
- `POST /api/ikarosmessages/{id}/resolve`
- `GET /ikarosnews`
- `POST /ikarosnews`
- `DELETE /ikarosnews/{id}`
- `GET /api/images/{id}`
- `GET /api/maptemplates`
- `GET /api/maptemplates/{id}`
- `POST /api/maptemplates`
- `PUT /api/maptemplates/{id}`
- `DELETE /api/maptemplates/{id}`
- `GET /api/news`
- `GET /api/news/{id}`
- `POST /api/news`
- `PUT /api/news/{id}`
- `DELETE /api/news/{id}`
- `GET /api/npctemplates`
- `GET /api/npctemplates/{id}`
- `POST /api/npctemplates`
- `PUT /api/npctemplates/{id}`
- `DELETE /api/npctemplates/{id}`
- `GET /api/pages`
- `GET /api/pages/directory`
- `GET /api/pages/favorite-pages`
- `POST /api/pages/favorite-pages/toggle/{slug}`
- `PUT /api/pages/favorite-pages/reorder`
- `GET /api/pages/favorite-pages/check/{slug}`
- `GET /api/pages/data`
- `GET /api/pages/dataSlugs`
- `GET /api/pages/{slug}`
- `GET /api/pages/meta/{slug}`
- `POST /api/pages`
- `PUT /api/pages`
- `DELETE /api/pages/{slug}`
- `GET /api/search`
- `GET /api/search/providers`
- `POST /api/search/created`
- `POST /api/search/updated`
- `POST /api/search/deleted`
- `POST /api/search/reindex`
- `GET /api/stats/search`
- `POST /api/stats/search/rebuild`
- `POST /api/stats/search/reindex`
- `GET /api/timeline`
- `GET /api/timeline/{id}`
- `POST /api/timeline`
- `PUT /api/timeline/{id}`
- `DELETE /api/timeline/{id}`
- `POST /api/upload/image`
- `GET /api/users/debug`
- `GET /api/users`
- `GET /api/users/exists/{username}`
- `GET /api/users/getCalendarMonth/{id}`
- `POST /api/users`
- `PUT /api/users/{id}`
- `PUT /api/users/{id}/theme`
- `PUT /api/users/updateCalendarMonth/{id}`
- `PUT /api/worlds/{worldId}/calendarconfig`
- `PUT /api/worlds/{worldId}/pages/{slug}`
- `GET /api/worlds/{worldId}/channels`
- `POST /api/worlds/{worldId}/channels`

### ✅ Pokryté endpointy (78)

<details><summary>Rozbalit</summary>

| Starý | Nový |
|-------|------|
| `POST /api/auth/login` | `POST /api/auth/login` |
| `GET /api/campaign/players` | `GET /api/campaign/players` |
| `GET /api/campaign/dashboard` | `GET /api/campaign/dashboard` |
| `GET /api/campaign/subjects` | `GET /api/campaign/subjects` |
| `GET /api/campaign/subjects/{id}` | `GET /api/campaign/subjects/:id` |
| `POST /api/campaign/subjects` | `POST /api/campaign/subjects` |
| `PUT /api/campaign/subjects/{id}` | `PUT /api/campaign/subjects/:id` |
| `DELETE /api/campaign/subjects/{id}` | `DELETE /api/campaign/subjects/:id` |
| `GET /api/campaign/relationships` | `GET /api/campaign/relationships` |
| `GET /api/campaign/relationships/{id}` | `GET /api/campaign/relationships/:id` |
| `POST /api/campaign/relationships` | `POST /api/campaign/relationships` |
| `PUT /api/campaign/relationships/{id}` | `PUT /api/campaign/relationships/:id` |
| `DELETE /api/campaign/relationships/{id}` | `DELETE /api/campaign/relationships/:id` |
| `GET /api/campaign/storylines` | `GET /api/campaign/storylines` |
| `GET /api/campaign/storylines/{id}` | `GET /api/campaign/storylines/:id` |
| `POST /api/campaign/storylines` | `POST /api/campaign/storylines` |
| `PUT /api/campaign/storylines/{id}` | `PUT /api/campaign/storylines/:id` |
| `DELETE /api/campaign/storylines/{id}` | `DELETE /api/campaign/storylines/:id` |
| `GET /api/campaign/quicknotes` | `GET /api/campaign/quicknotes` |
| `GET /api/campaign/quicknotes/{id}` | `GET /api/campaign/quicknotes/:id` |
| `POST /api/campaign/quicknotes` | `POST /api/campaign/quicknotes` |
| `PUT /api/campaign/quicknotes/{id}` | `PUT /api/campaign/quicknotes/:id` |
| `DELETE /api/campaign/quicknotes/{id}` | `DELETE /api/campaign/quicknotes/:id` |
| `GET /api/campaign/scenarios` | `GET /api/campaign/scenarios` |
| `GET /api/campaign/scenarios/{id}` | `GET /api/campaign/scenarios/:id` |
| `POST /api/campaign/scenarios` | `POST /api/campaign/scenarios` |
| `PUT /api/campaign/scenarios/{id}` | `PUT /api/campaign/scenarios/:id` |
| `DELETE /api/campaign/scenarios/{id}` | `DELETE /api/campaign/scenarios/:id` |
| `GET /api/campaign/shopitems` | `GET /api/campaign/shopitems` |
| `GET /api/campaign/shopitems/{id}` | `GET /api/campaign/shopitems/:id` |
| `POST /api/campaign/shopitems` | `POST /api/campaign/shopitems` |
| `PUT /api/campaign/shopitems/{id}` | `PUT /api/campaign/shopitems/:id` |
| `DELETE /api/campaign/shopitems/{id}` | `DELETE /api/campaign/shopitems/:id` |
| `GET /api/emotes/{worldId}` | `GET /api/emotes/:worldId` |
| `POST /api/emotes/{worldId}` | `POST /api/emotes/:worldId` |
| `DELETE /api/emotes/{worldId}/{id}` | `DELETE /api/emotes/:worldId/:id` |
| `GET /api/maps` | `GET /api/maps` |
| `GET /api/maps/active` | `GET /api/maps/active` |
| `GET /api/maps/{id}` | `GET /api/maps/:id` |
| `POST /api/maps` | `POST /api/maps` |
| `POST /api/maps/{id}/active` | `POST /api/maps/:id/active` |
| `PUT /api/maps/{id}` | `PUT /api/maps/:id` |
| `PATCH /api/maps/{id}/move-token` | `PATCH /api/maps/:id/move-token` |
| `PATCH /api/maps/{id}/remove-token` | `PATCH /api/maps/:id/remove-token` |
| `DELETE /api/maps/{id}` | `DELETE /api/maps/:id` |
| `GET /api/presence/online` | `GET /api/presence/online` |
| `GET /api/push/vapid-public-key` | `GET /api/push/vapid-public-key` |
| `POST /api/push/subscribe` | `POST /api/push/subscribe` |
| `POST /api/push/unsubscribe` | `POST /api/push/unsubscribe` |
| `GET /api/sounds` | `GET /api/sounds` |
| `GET /api/sounds/{id}` | `GET /api/sounds/:id` |
| `POST /api/sounds` | `POST /api/sounds` |
| `PUT /api/sounds/{id}` | `PUT /api/sounds/:id` |
| `DELETE /api/sounds/{id}` | `DELETE /api/sounds/:id` |
| `GET /api/universe` | `GET /api/universe` |
| `PUT /api/universe` | `PUT /api/universe` |
| `GET /api/users/{id}` | `GET /api/users/:id` |
| `GET /api/users/profile/{id}` | `GET /api/users/profile/:id` |
| `PATCH /api/users/{id}` | `PATCH /api/users/:id` |
| `DELETE /api/users/{id}` | `DELETE /api/users/:id` |
| `GET /api/worlds` | `GET /api/worlds` |
| `GET /api/worlds/{id}` | `GET /api/worlds/:id` |
| `GET /api/worlds/my` | `GET /api/worlds/my` |
| `GET /api/worlds/{id}/members` | `GET /api/worlds/:id/members` |
| `POST /api/worlds/{id}/join` | `POST /api/worlds/:id/join` |
| `POST /api/worlds` | `POST /api/worlds` |
| `PATCH /api/worlds/{worldId}` | `PATCH /api/worlds/:id` |
| `GET /api/worlds/{worldId}/settings` | `GET /api/worlds/:worldId/settings` |
| `PUT /api/worlds/{worldId}/settings` | `PUT /api/worlds/:worldId/settings` |
| `PATCH /api/worlds/{worldId}/members/{membershipId}/group` | `PATCH /api/worlds/:worldId/members/:membershipId/group` |
| `PATCH /api/worlds/{worldId}/members/{membershipId}/role` | `PATCH /api/worlds/:worldId/members/:membershipId/role` |
| `PATCH /api/worlds/{worldId}/members/{membershipId}/akj` | `PATCH /api/worlds/:worldId/members/:membershipId/akj` |
| `PATCH /api/worlds/{worldId}/members/{membershipId}/character` | `PATCH /api/worlds/:worldId/members/:membershipId/character` |
| `GET /api/worlds/{worldId}/pages` | `GET /api/worlds/:worldId/pages` |
| `GET /api/worlds/{worldId}/pages/{slug}` | `GET /api/worlds/:worldId/pages/:slug` |
| `POST /api/worlds/{worldId}/pages` | `POST /api/worlds/:worldId/pages` |
| `DELETE /api/worlds/{worldId}/pages/{slug}` | `DELETE /api/worlds/:worldId/pages/:id` |
| `DELETE /api/worlds/{id}` | `DELETE /api/worlds/:id` |

</details>

### ➕ Nové endpointy (jen v novém backendu)

- `GET /api/health`
- `GET /api/admin/users`
- `PATCH /api/admin/users/:id/role`
- `PATCH /api/admin/users/:id/akj`
- `GET /api/admin/recent-pages`
- `POST /api/auth/register`
- `GET /api/campaign/changelog`
- `GET /api/worlds/:worldId/characters/:slug/diary`
- `PATCH /api/worlds/:worldId/characters/:slug/diary`
- `GET /api/worlds/:worldId/characters/:slug/calendar`
- `PATCH /api/worlds/:worldId/characters/:slug/calendar`
- `GET /api/worlds/:worldId/characters/:slug/finance`
- `PATCH /api/worlds/:worldId/characters/:slug/finance`
- `POST /api/worlds/:worldId/characters/:slug/finance/add-monthly`
- `POST /api/worlds/:worldId/characters/:slug/finance/undo`
- `GET /api/worlds/:worldId/characters/:slug/inventory`
- `PATCH /api/worlds/:worldId/characters/:slug/inventory`
- `GET /api/worlds/:worldId/characters/:slug/notes`
- `PATCH /api/worlds/:worldId/characters/:slug/notes`
- `GET /api/worlds/:worldId/characters`
- `GET /api/worlds/:worldId/characters/players`
- `GET /api/worlds/:worldId/characters/directory`
- `GET /api/worlds/:worldId/characters/by-user/:userId`
- `GET /api/worlds/:worldId/characters/:slug`
- `POST /api/worlds/:worldId/characters`
- `PATCH /api/worlds/:worldId/characters/:slug`
- `PATCH /api/worlds/:worldId/characters/:slug/convert`
- `DELETE /api/worlds/:worldId/characters/:slug`
- `GET /api/worlds/:worldId/chat/groups`
- `POST /api/worlds/:worldId/chat/groups`
- `PATCH /api/worlds/:worldId/chat/groups/:groupId`
- `DELETE /api/worlds/:worldId/chat/groups/:groupId`
- `POST /api/worlds/:worldId/chat/groups/:groupId/channels`
- `PATCH /api/worlds/:worldId/chat/channels/:channelId`
- `DELETE /api/worlds/:worldId/chat/channels/:channelId`
- `GET /api/worlds/:worldId/chat/channels/:channelId/messages`
- `POST /api/worlds/:worldId/chat/channels/:channelId/messages`
- `PATCH /api/worlds/:worldId/chat/messages/:messageId`
- `DELETE /api/worlds/:worldId/chat/messages/:messageId`
- `POST /api/worlds/:worldId/chat/channels/:channelId/read`
- `GET /api/worlds/:worldId/chat/unread`
- `PUT /api/worlds/:worldId/chat/messages/:messageId/reactions/:emoji`
- `GET /api/dungeon-maps`
- `GET /api/dungeon-maps/:id`
- `POST /api/dungeon-maps`
- `PUT /api/dungeon-maps/:id`
- `DELETE /api/dungeon-maps/:id`
- `POST /api/dungeon-maps/:id/export-template`
- `POST /api/dungeon-maps/:id/export-scene`
- `GET /api/emotes/global`
- `POST /api/emotes/global`
- `DELETE /api/emotes/global/:id`
- `POST /api/emotes/:worldId/:id/copy`
- `GET /api/global-chat/messages`
- `POST /api/global-chat/messages`
- `DELETE /api/global-chat/messages/:messageId`
- `GET /api/ikaros-articles`
- `GET /api/ikaros-articles/my`
- `GET /api/ikaros-articles/pending`
- `GET /api/ikaros-articles/stats`
- `GET /api/ikaros-articles/:id`
- `POST /api/ikaros-articles`
- `PUT /api/ikaros-articles/:id`
- `DELETE /api/ikaros-articles/:id`
- `POST /api/ikaros-articles/:id/submit`
- `POST /api/ikaros-articles/:id/approve`
- `POST /api/ikaros-articles/:id/reject`
- `POST /api/ikaros-articles/:id/rate`
- `GET /api/ikaros-discussions`
- `GET /api/ikaros-discussions/pending`
- `GET /api/ikaros-discussions/my-favorites`
- `GET /api/ikaros-discussions/:id`
- `POST /api/ikaros-discussions`
- `PATCH /api/ikaros-discussions/:id`
- `POST /api/ikaros-discussions/:id/approve`
- `POST /api/ikaros-discussions/:id/reject`
- `POST /api/ikaros-discussions/:id/invite`
- `POST /api/ikaros-discussions/:id/toggle-favorite`
- `GET /api/ikaros-discussions/:id/posts`
- `POST /api/ikaros-discussions/:id/posts`
- `DELETE /api/ikaros-discussions/:id/posts/:postId`
- `GET /api/ikaros-gallery`
- `GET /api/ikaros-gallery/my`
- `GET /api/ikaros-gallery/pending`
- `GET /api/ikaros-gallery/:id`
- `POST /api/ikaros-gallery`
- `PUT /api/ikaros-gallery/:id`
- `DELETE /api/ikaros-gallery/:id`
- `POST /api/ikaros-gallery/:id/submit`
- `POST /api/ikaros-gallery/:id/approve`
- `POST /api/ikaros-gallery/:id/reject`
- `POST /api/ikaros-gallery/:id/rate`
- `GET /api/ikaros-messages/inbox`
- `GET /api/ikaros-messages/sent`
- `GET /api/ikaros-messages/unread-count`
- `GET /api/ikaros-messages/:id`
- `POST /api/ikaros-messages`
- `DELETE /api/ikaros-messages/:id`
- `POST /api/ikaros-messages/:id/resolve`
- `GET /api/IkarosNews`
- `POST /api/IkarosNews`
- `DELETE /api/IkarosNews/:id`
- `GET /api/images/*`
- `GET /api/map-templates`
- `GET /api/map-templates/:id`
- `POST /api/map-templates`
- `PUT /api/map-templates/:id`
- `DELETE /api/map-templates/:id`
- `GET /api/worlds/:worldId/npc-templates`
- `GET /api/worlds/:worldId/npc-templates/global`
- `GET /api/worlds/:worldId/npc-templates/:id`
- `POST /api/worlds/:worldId/npc-templates`
- `PUT /api/worlds/:worldId/npc-templates/:id`
- `DELETE /api/worlds/:worldId/npc-templates/:id`
- `POST /api/worlds/:worldId/npc-templates/:id/import`
- `GET /api/worlds/:worldId/pages/directory`
- `GET /api/worlds/:worldId/pages/dataSlugs`
- `GET /api/worlds/:worldId/pages/data`
- `GET /api/worlds/:worldId/pages/meta/:slug`
- `PATCH /api/worlds/:worldId/pages/:id`
- `POST /api/worlds/:worldId/pages/:slug/favorite`
- `DELETE /api/worlds/:worldId/pages/:slug/favorite`
- `GET /api/api/search`
- `GET /api/api/search/providers`
- `POST /api/api/search/created`
- `POST /api/api/search/updated`
- `POST /api/api/search/deleted`
- `POST /api/api/search/reindex`
- `POST /api/api/search/rebuild`
- `GET /api/sounds/pending`
- `POST /api/sounds/:id/approve`
- `POST /api/sounds/:id/reject`
- `GET /api/worlds/:worldId/sounds`
- `GET /api/worlds/:worldId/sounds/:id`
- `POST /api/worlds/:worldId/sounds/import/:globalId`
- `POST /api/worlds/:worldId/sounds`
- `PUT /api/worlds/:worldId/sounds/:id`
- `DELETE /api/worlds/:worldId/sounds/:id`
- `POST /api/worlds/:worldId/sounds/:id/nominate`
- `GET /api/api/stats/search`
- `POST /api/api/stats/search/rebuild`
- `POST /api/api/stats/search/reindex`
- `PATCH /api/universe/:worldId/nodes/:nodeId/visibility`
- `POST /api/upload`
- `GET /api/users/me`
- `PUT /api/users/password`
- `PUT /api/users/:id/reset-password`
- `GET /api/worlds/:worldId/currencies`
- `PUT /api/worlds/:worldId/currencies`
- `POST /api/worlds/:worldId/currencies/convert`
- `GET /api/worlds/slug/:slug`
- `DELETE /api/worlds/:worldId/members/:membershipId`
- `PATCH /api/worlds/:worldId/members/:membershipId/free`
- `GET /api/worlds/:worldId/favorites`

---

## WebSocket události

### ❌ Chybějící

- `[client→server] ChatHub::JoinChannel`
- `[client→server] ChatHub::LeaveChannel`
- `[client→server] ChatHub::Typing`
- `[client→server] IkarosChatHub::JoinRoom`
- `[client→server] IkarosChatHub::LeaveRoom`
- `[client→server] IkarosChatHub::SendMessage`
- `[client→server] IkarosChatHub::SetRoomStyle`
- `[client→server] MapHub::JoinMap`
- `[client→server] MapHub::LeaveMap`
- `[client→server] MapHub::TokenMoved`
- `[client→server] MapHub::ConfigUpdated`
- `[client→server] MapHub::TokenRemoved`
- `[client→server] MapHub::ReloadScene`
- `[client→server] MapHub::SceneCleared`
- `[client→server] MapHub::PingMap`
- `[client→server] MapHub::EffectAdded`
- `[client→server] MapHub::EffectRemoved`
- `[client→server] MapHub::FogUpdated`
- `[client→server] MapHub::DiceRolled`
- `[client→server] MapHub::SceneStateChanged`
- `[client→server] MapHub::ActiveSoundChanged`
- `[server→client] UserTyping`
- `[server→client] LoadHistory`
- `[server→client] UserJoined`
- `[server→client] UpdateUserList`
- `[server→client] UserLeft`
- `[server→client] UpdateUserList`
- `[server→client] ReceiveMessage`
- `[server→client] ReceiveMessage`
- `[server→client] ReceiveMessage`
- `[server→client] UserLeft`
- `[server→client] UpdateUserList`
- `[server→client] RoomStyleChanged`
- `[server→client] OnTokenMoved`
- `[server→client] OnConfigUpdated`
- `[server→client] OnTokenRemoved`
- `[server→client] OnSceneReloaded`
- `[server→client] OnSceneCleared`
- `[server→client] OnMapPinged`
- `[server→client] OnEffectAdded`
- `[server→client] OnEffectRemoved`
- `[server→client] OnFogUpdated`
- `[server→client] OnDiceRolled`
- `[server→client] OnSceneStateChanged`
- `[server→client] OnActiveSoundChanged`

### ➕ Nové události

- `[client→server] ChatGateway::typing:start`
- `[client→server] ChatGateway::typing:stop`
- `[client→server] GlobalChatGateway::chat:hospoda:join`
- `[client→server] GlobalChatGateway::chat:hospoda:leave`
- `[client→server] MapsGateway::map:join`
- `[client→server] MapsGateway::map:leave`
- `[client→server] MapsGateway::map:token-moved`
- `[client→server] MapsGateway::map:config-updated`
- `[client→server] MapsGateway::map:token-removed`
- `[client→server] MapsGateway::map:reload-scene`
- `[client→server] MapsGateway::map:scene-cleared`
- `[client→server] MapsGateway::map:ping`
- `[client→server] MapsGateway::map:effect-added`
- `[client→server] MapsGateway::map:effect-removed`
- `[client→server] MapsGateway::map:fog-updated`
- `[client→server] MapsGateway::map:dice-rolled`
- `[client→server] MapsGateway::map:scene-state-changed`
- `[client→server] MapsGateway::map:sound-changed`
- `[server→client] chat:typing`
- `[server→client] chat:message`
- `[server→client] chat:message:updated`
- `[server→client] chat:message:deleted`
- `[server→client] chat:channel:created`
- `[server→client] chat:channel:updated`
- `[server→client] chat:channel:deleted`
- `[server→client] chat:group:created`
- `[server→client] chat:group:updated`
- `[server→client] chat:group:deleted`
- `[server→client] chat:unread`
- `[server→client] emote:created`
- `[server→client] chat:presence`
- `[server→client] chat:message`
- `[server→client] chat:message:deleted`
- `[server→client] ikaros:new-message`
- `[server→client] map:token-moved`
- `[server→client] map:config-updated`
- `[server→client] map:token-removed`
- `[server→client] map:scene-reloaded`
- `[server→client] map:scene-cleared`
- `[server→client] map:pinged`
- `[server→client] map:effect-added`
- `[server→client] map:effect-removed`
- `[server→client] map:fog-updated`
- `[server→client] map:dice-rolled`
- `[server→client] map:scene-state-changed`
- `[server→client] map:sound-changed`
- `[server→client] universe:updated`
- `[server→client] world:updated`
- `[server→client] world:deleted`
- `[server→client] world:membership:changed`
- `[server→client] world:membership:removed`

---

## MongoDB schémata

### ❌ Chybějící kolekce

- `sounds`
- `Worlds`
- `WorldMemberships`
- `IkarosNews`
- `IkarosMessages`
- `IkarosDiscussions`
- `IkarosDiscussionPosts`
- `IkarosArticles`
- `IkarosGallery`
- `PushSubscriptions`
- `CampaignSubjects`
- `CampaignRelationships`
- `CampaignStorylines`
- `CampaignQuickNotes`
- `CampaignShopItems`
- `CampaignScenarios`
- `WorldPages`
- `WorldSettings`
- `Universes`

### ➕ Nové kolekce

- `CampaignChangeLogSchemaClass`
- `CampaignQuickNoteSchemaClass`
- `CampaignRelationshipSchemaClass`
- `CampaignScenarioSchemaClass`
- `CampaignShopItemSchemaClass`
- `CampaignStorylineSchemaClass`
- `CampaignSubjectSchemaClass`
- `CharacterCalendarSchemaClass`
- `CharacterDiarySchemaClass`
- `CharacterFinanceSchemaClass`
- `CharacterInventorySchemaClass`
- `CharacterNotesSchemaClass`
- `CharacterSchemaClass`
- `ChannelReadStatusSchemaClass`
- `ChatChannelSchemaClass`
- `ChatGroupSchemaClass`
- `ChatMessageSchemaClass`
- `DungeonMapSchemaClass`
- `CustomEmoteDocument`
- `GameEventSchemaClass`
- `IkarosArticleSchemaClass`
- `IkarosDiscussionPostSchemaClass`
- `IkarosDiscussionSchemaClass`
- `IkarosGallerySchemaClass`
- `IkarosMessageSchemaClass`
- `IkarosNewsSchemaClass`
- `MapSceneSchemaClass`
- `MapTemplateSchemaClass`
- `NpcTemplateSchemaClass`
- `PageSchemaClass`
- `PushSubscriptionSchemaClass`
- `PageEmbeddingSchemaClass`
- `SearchIndexStatsSchemaClass`
- `IndexingFailureSchemaClass`
- `SoundSchemaClass`
- `UniverseMapSchemaClass`
- `UserSchemaClass`
- `WorldCurrenciesSchemaClass`
- `WorldMembershipSchemaClass`
- `WorldSettingsSchemaClass`
- `WorldSchemaClass`

---

## Cron joby / Background joby

### ❌ Chybějící

- `GameEventCleanupService`

---

## JWT Claims

### ➕ Nové claims

- `sub`
- `email`
- `username`
- `role`
- `characterPath`
- `ikarosSkin`

---

## Závěry a rozhodnutí

<!-- Manuálně doplnit po analýze výsledků. Pro každou mezeru rozhodnout: -->
<!-- - opravit (implementovat chybějící) -->
<!-- - akceptovat (záměrná změna / redesign) -->
<!-- - přeskočit (funkce se nepoužívá) -->

**Celkem zjištěných mezer: 203**

### Seed data (manuální ověření)

Nový backend seed soubory: `matrix-world.seed.ts`

Ověřeno:
- Matrix world seed: ✅
- Chat skupiny (6): ❌ (seed soubor nepokrývá chat skupiny samostatně)
- Šablony stránek (5 per svět): ❌ (seed soubor nepokrývá šablony stránek)
