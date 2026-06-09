// F11 — tělo mongosh importu (chat). Workflow předem definuje DIAG/DRY/WORLD/data.
// data = {groups[], channels[], messages[], readStatuses[], emote}. IIFE (gotcha #3).
// Princip: skupiny resolve podle logického klíče (find-or-create), kanály upsert podle
// _migOldId (character: merge podle linkedMemberUserId), zprávy/readstatus remap channelId
// až tady. Idempotentní. Spec: docs/arch/migration-matrix/f11-chat.md (FE repo).
(function () {
  const PJ_MIN = 4; // WorldRole.PomocnyPJ — vedení vidí members kanály
  const now = new Date();

  // worldId v chat entitách = string; membership může být string i ObjectId.
  const memberFilter = { $or: [{ worldId: WORLD }] };
  try { memberFilter.$or.push({ worldId: ObjectId(WORLD) }); } catch (e) {}
  const members = db.worldmemberships.find(memberFilter).toArray();
  const pjIds = members.filter((m) => (m.role || 0) >= PJ_MIN).map((m) => String(m.userId));
  const factionMembers = (faction) => {
    const set = new Set(pjIds);
    for (const m of members) if (m.group === faction) set.add(String(m.userId));
    return [...set];
  };
  const withPj = (ids) => { const s = new Set(ids.map(String)); for (const p of pjIds) s.add(p); return [...s]; };

  // ─── DIAG: jen vypiš živý stav, nic neměň ───
  if (typeof DIAG !== 'undefined' && DIAG) {
    print('=== F11 DIAG (svět ' + WORLD + ') ===');
    print('worldmemberships: ' + members.length + ' | PJ+ (role>=4): ' + pjIds.length);
    const gs = db.chatgroups.find({ worldId: WORLD }).toArray();
    print('chatgroups: ' + gs.length);
    for (const g of gs) print('  - "' + g.name + '"  linkedWorldGroup=' + (g.linkedWorldGroup || '-') + '  color=' + (g.color || '-') + '  _id=' + g._id);
    const chs = db.chatchannels.find({ worldId: WORLD }).toArray();
    print('chatchannels: ' + chs.length + ' (character: ' + chs.filter((c) => c.type === 'character').length + ', _mig f11: ' + chs.filter((c) => c._mig === 'f11').length + ')');
    const postavy = gs.find((g) => g.name === 'Postavy' && !g.linkedWorldGroup);
    if (postavy) {
      const cc = db.chatchannels.find({ worldId: WORLD, groupId: String(postavy._id) }).toArray();
      print('Postavy character kanály (' + cc.length + '): ' + cc.map((c) => c.name + '[' + (c.linkedMemberUserId || '?') + ']').join(', '));
    }
    print('chatmessages(svět): ' + db.chatmessages.countDocuments({ worldId: WORLD }) + ' | _mig f11: ' + db.chatmessages.countDocuments({ worldId: WORLD, _mig: 'f11' }));
    print('channelreadstatus _mig f11: ' + db.channelreadstatus.countDocuments({ _mig: 'f11' }));
    print('custom_emotes(svět): ' + db.custom_emotes.countDocuments({ worldId: ObjectId(WORLD) }));
    print('--- data k importu: groups=' + data.groups.length + ' channels=' + data.channels.length + ' messages=' + data.messages.length + ' readStatus=' + data.readStatuses.length + ' emote=' + (data.emote ? 1 : 0));
    return;
  }

  // ─── 1) GROUPS: resolve logický klíč -> živé _id ───
  const gkId = {};
  let gCreated = 0, gFound = 0;
  for (const g of data.groups) {
    let doc;
    if (g.kind === 'linked') {
      doc = db.chatgroups.findOne({ worldId: WORLD, linkedWorldGroup: g.linkedWorldGroup });
    } else {
      // default/standalone — bez linkedWorldGroup
      doc = db.chatgroups.find({ worldId: WORLD, name: g.name }).toArray().find((x) => !x.linkedWorldGroup);
    }
    if (doc) {
      gFound++;
      // doplň barvu/ikonu jen když chybí (nepřepisuj PJ volbu)
      const set = {};
      if (g.desiredColor && !doc.color) set.color = g.desiredColor;
      if (g.imageUrl && !doc.imageUrl) set.imageUrl = g.imageUrl;
      if (!DRY && Object.keys(set).length) db.chatgroups.updateOne({ _id: doc._id }, { $set: set });
      gkId[g.key] = String(doc._id);
    } else {
      gCreated++;
      const _id = ObjectId();
      const ndoc = { _id, worldId: WORLD, name: g.name, order: g.order != null ? g.order : 0, _mig: 'f11', createdAt: now, updatedAt: now };
      if (g.kind === 'linked') ndoc.linkedWorldGroup = g.linkedWorldGroup;
      if (g.desiredColor) ndoc.color = g.desiredColor;
      if (g.imageUrl) ndoc.imageUrl = g.imageUrl;
      if (!DRY) db.chatgroups.insertOne(ndoc);
      gkId[g.key] = String(_id);
    }
  }

  // ─── 2) CHANNELS: resolve groupId, character merge, upsert by _migOldId ───
  const chanIdMap = {}; // oldId -> živé channel _id (string)
  let chMerged = 0, chCreated = 0, chUpdated = 0, chSkip = 0;
  for (const c of data.channels) {
    const groupId = gkId[c.groupKey];
    if (!groupId) { chSkip++; print('!! kanál bez skupiny: ' + c.name + ' (' + c.groupKey + ')'); continue; }

    // allowedMemberIds
    let allowed;
    if (c.type === 'character') allowed = c.allowedMemberIds || [];
    else if (c.factionGroup) allowed = factionMembers(c.factionGroup);
    else if (c.accessMode === 'members') allowed = withPj(c.allowedMemberIds || []);
    else allowed = [];

    const base = {
      groupId, worldId: WORLD, name: c.name, isGlobal: false,
      accessMode: c.accessMode, allowedRoles: [], allowedMemberIds: allowed,
      order: c.order || 0, isDeleted: false, type: c.type,
      updatedAt: now,
    };
    if (c.imageUrl) base.imageUrl = c.imageUrl;
    if (c.linkedMemberUserId) base.linkedMemberUserId = c.linkedMemberUserId;

    if (c.type === 'character' && c.linkedMemberUserId) {
      // merge do existujícího auto-kanálu (ensureCharacterChannel) podle linkedMemberUserId
      const existing = db.chatchannels.findOne({ worldId: WORLD, groupId: groupId, linkedMemberUserId: c.linkedMemberUserId });
      if (existing) {
        chMerged++;
        chanIdMap[c.oldId] = String(existing._id);
        if (!DRY) db.chatchannels.updateOne({ _id: existing._id }, { $set: { name: c.name, _migOldId: c.oldId } });
        continue;
      }
      // nový character kanál (hráč auto-kanál neměl) — bez _mig (chová se jak auto)
      const _id = ObjectId();
      chanIdMap[c.oldId] = String(_id);
      if (!DRY) db.chatchannels.insertOne(Object.assign({ _id, _migOldId: c.oldId, createdAt: now }, base));
      chCreated++;
      continue;
    }

    // non-character: upsert podle _migOldId (stabilní napříč re-buildy)
    const found = db.chatchannels.findOne({ worldId: WORLD, _migOldId: c.oldId });
    if (found) {
      chUpdated++;
      chanIdMap[c.oldId] = String(found._id);
      if (!DRY) db.chatchannels.updateOne({ _id: found._id }, { $set: Object.assign({ _mig: 'f11' }, base) });
    } else {
      chCreated++;
      const _id = ObjectId(c.newId);
      chanIdMap[c.oldId] = String(_id);
      if (!DRY) db.chatchannels.insertOne(Object.assign({ _id, _migOldId: c.oldId, _mig: 'f11', createdAt: now }, base));
    }
  }

  // ─── 3) MESSAGES: channelId = chanIdMap, upsert by _id, zachovat createdAt ───
  let mIns = 0, mUpd = 0, mSkip = 0;
  const lastByChan = {}; // channelId -> {at, preview}
  for (const m of data.messages) {
    const channelId = chanIdMap[m.channelOldId];
    if (!channelId) { mSkip++; continue; }
    const _id = ObjectId(m._id);
    const doc = {
      channelId, worldId: WORLD, senderId: m.senderId, senderName: m.senderName,
      content: m.content != null ? m.content : null,
      isEdited: !!m.isEdited, isDeleted: !!m.isDeleted, isSystem: false,
      reactions: m.reactions || {}, attachments: m.attachments || [],
      customFont: m.customFont || null, customFontSize: null, color: null,
      isDiceRoll: false, dicePayload: null, diceSkin: null, mentions: [],
      createdAt: m.createdAt ? new Date(m.createdAt) : now,
      updatedAt: m.updatedAt ? new Date(m.updatedAt) : now,
      _mig: 'f11',
    };
    if (m.overrideName) doc.overrideName = m.overrideName;
    if (m.overrideAvatarUrl) doc.overrideAvatarUrl = m.overrideAvatarUrl;
    if (m.rpDate) doc.rpDate = m.rpDate;
    if (m.replyToId) doc.replyToId = m.replyToId;
    if (m.replyToPreview) doc.replyToPreview = m.replyToPreview;
    if (m.replyToSenderName) doc.replyToSenderName = m.replyToSenderName;

    const exists = db.chatmessages.findOne({ _id: _id }, { _id: 1 });
    if (!DRY) db.chatmessages.updateOne({ _id: _id }, { $set: doc }, { upsert: true });
    if (exists) mUpd++; else mIns++;

    // last message tracker (pro sidebar)
    if (!m.isDeleted) {
      const at = doc.createdAt;
      if (!lastByChan[channelId] || at > lastByChan[channelId].at) {
        let prev = m.content || (doc.attachments.length ? '📎 příloha' : '');
        if (prev.length > 80) prev = prev.slice(0, 80);
        lastByChan[channelId] = { at, preview: prev };
      }
    }
  }

  // ─── 3b) lastMessageAt/Preview na kanály ───
  if (!DRY) for (const [cid, info] of Object.entries(lastByChan)) {
    db.chatchannels.updateOne({ _id: ObjectId(cid) }, { $set: { lastMessageAt: info.at, lastMessagePreview: info.preview } });
  }

  // ─── 4) READ STATUSES ───
  let rIns = 0, rUpd = 0, rSkip = 0;
  for (const r of data.readStatuses) {
    const channelId = chanIdMap[r.channelOldId];
    if (!channelId) { rSkip++; continue; }
    const filter = { userId: r.userId, channelId };
    const exists = db.channelreadstatus.findOne(filter, { _id: 1 });
    if (!DRY) db.channelreadstatus.updateOne(filter, { $set: { lastReadAt: new Date(r.lastReadAt), lastReadMessageId: null, _mig: 'f11' } }, { upsert: true });
    if (exists) rUpd++; else rIns++;
  }

  // ─── 5) EMOTE ───
  let eDone = 0;
  if (data.emote) {
    const e = data.emote;
    const filter = { worldId: ObjectId(WORLD), shortcode: e.shortcode };
    if (!DRY) db.custom_emotes.updateOne(filter, { $set: {
      name: e.name, imageId: e.imageId, imageUrl: e.imageUrl,
      createdBy: ObjectId(e.createdBy), tags: [], _mig: 'f11', createdAt: now,
    } }, { upsert: true });
    eDone = 1;
  }

  print('=== F11 chat ' + (DRY ? 'DRY-RUN' : 'IMPORT') + ' (svět ' + WORLD + ') ===');
  print('skupiny: nalezeno=' + gFound + ' vytvořeno=' + gCreated);
  print('kanály: merge(character)=' + chMerged + ' vytvořeno=' + chCreated + ' update=' + chUpdated + ' skip=' + chSkip);
  print('zprávy: nových=' + mIns + ' update=' + mUpd + ' skip=' + mSkip);
  print('readStatus: nových=' + rIns + ' update=' + rUpd + ' skip=' + rSkip);
  print('emote: ' + eDone);
})();
