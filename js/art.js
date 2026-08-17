/* ============================================================
   CREATURE ART — a JSON manifest maps each creature's name to an
   image file in the creatures/ folder. Cards without art fall back
   to the default template silhouette.

   To add art: drop the image into the creatures/ folder, then open
   creatures/art.json and set that creature's "img" to the file
   path, e.g.  "img": "creatures/vorlag.jpg".
   ============================================================ */
const CREATURE_ART_FILE = 'creatures/art.json';
const CREATURE_EVOLUTION_FILE = 'creatures/evolutions.json';
let CREATURE_ART = {};
let CREATURE_EVOLUTION_ART = {};

function creatureImg(name) {
  let src = CREATURE_ART[name] || '';
  // a bare filename (no folder) is assumed to live in creatures/
  if (src && src.indexOf('/') === -1) src = 'creatures/' + src;
  return src;
}
function evolutionImg(name, phase) {
  const entry = CREATURE_EVOLUTION_ART[name] || {};
  let src = entry[phase] || '';
  if (!src) return creatureImg(name);
  if (src.indexOf('/') === -1) src = 'creatures/' + src;
  return src;
}

async function loadCreatureArt() {
  if (window.shadowveilLoaderStatus) window.shadowveilLoaderStatus('Loading creature art...');
  try {
    // cache-buster so edits to the manifest always show up on reload
    const res = await fetch(CREATURE_ART_FILE + '?v=' + Date.now());
    const data = await res.json();
    const next = {};
    (data.creatures || []).forEach(c => {
      if (c && c.name) next[c.name] = c.img || '';
    });
    CREATURE_ART = next;
  } catch (e) {
    CREATURE_ART = {};
  }
  try {
    const res = await fetch(CREATURE_EVOLUTION_FILE + '?v=' + Date.now());
    const data = await res.json();
    const next = {};
    (data.evolutions || []).forEach(c => { if (c && c.name) next[c.name] = c; });
    CREATURE_EVOLUTION_ART = next;
  } catch (e) {
    CREATURE_EVOLUTION_ART = {};
  }
  // cards may already be drawn — refresh them once art is known
  if (typeof renderCollection === 'function') renderCollection();
}

loadCreatureArt().then(() => {
  if (window.shadowveilLoaderReady) window.shadowveilLoaderReady('art');
});
