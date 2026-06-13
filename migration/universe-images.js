// Fáze B — universe (mapa vesmíru): přepíše `universeMaps.nodes[].img`
// z relativního názvu ('svar.jpg') na Cloudinary URL z MAP. Zachovává pozice
// uzlů, viditelnost i ostatní pole (mění JEN img). Idempotentní: uzel, který
// už má cloudinary URL, se přeskočí.
//
// MAP (= migration/universe-images-map.json, { 'svar.jpg': 'https://…' }) a DRY
// injektuje workflow fix-matrix-universe-images.yml.

function runFix() {
  var coll = db.universeMaps;
  var docsChanged = 0;
  var nodesChanged = 0;
  var total = 0;
  var nomap = {};
  coll.find({}).forEach(function (d) {
    if (!Array.isArray(d.nodes)) return;
    var dirty = false;
    d.nodes.forEach(function (node) {
      var img = node.img;
      if (typeof img !== 'string' || img.length === 0) return;
      total++;
      if (img.indexOf('res.cloudinary.com') !== -1) return; // idempotent
      var url = MAP[img];
      if (url) {
        node.img = url;
        dirty = true;
        nodesChanged++;
      } else {
        nomap[img] = (nomap[img] || 0) + 1;
      }
    });
    if (dirty) {
      docsChanged++;
      if (!DRY) coll.updateOne({ _id: d._id }, { $set: { nodes: d.nodes } });
    }
  });
  print(
    (DRY ? '[DRY] ' : '') +
      'docs zmeneno: ' +
      docsChanged +
      ', uzlu prepsano: ' +
      nodesChanged +
      ', uzlu s img celkem: ' +
      total,
  );
  var missKeys = Object.keys(nomap);
  if (missKeys.length) print('NOMAP (chybi v mape): ' + missKeys.join(', '));
}
