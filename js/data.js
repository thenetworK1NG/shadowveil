/* ============================================================
   HOW TO ADD YOUR CREATURES' PHOTOS
   ------------------------------------------------------------
   1) Drop the image file into the "creatures" folder.
   2) Open creatures/art.json and set that creature's "img" to the
      file path, e.g.  "img": "creatures/vorlag.jpg"
   3) Leave "img": "" to use the automatic placeholder silhouette.
   The img field here in data.js is no longer used — art is read
   from creatures/art.json via js/art.js.
   ------------------------------------------------------------
   Each creature: name, role, realm, img, power (0-100), cunning,
   arcana, rarity: 'bronze' | 'silver' | 'gold' | 'diamond'
   ============================================================ */
const PLAYERS = [
  { name: 'Vorlag, the Ember Wyrm',    role: 'Brute',   realm: 'Ember Court',    img: '', power: 94, cunning: 12, arcana: 82, rarity: 'diamond' },
  { name: 'Mordrax, the Void Serpent', role: 'Mystic',  realm: 'Shadowmere',     img: '', power: 15, cunning: 95, arcana: 70, rarity: 'diamond' },
  { name: 'Kaelen, Storm Warden',      role: 'Warden',  realm: 'Stormhold',      img: '', power: 88, cunning: 62, arcana: 85, rarity: 'gold'    },
  { name: 'Zephyra, Wind Spirit',      role: 'Stalker', realm: 'Stormhold',      img: '', power: 91, cunning: 10, arcana: 78, rarity: 'gold'    },
  { name: 'Nyx, the Shadow Stalker',   role: 'Stalker', realm: 'Shadowmere',     img: '', power: 32, cunning: 93, arcana: 74, rarity: 'gold'    },
  { name: 'Thorne, Grave Reaper',      role: 'Stalker', realm: 'Duskwold',       img: '', power: 85, cunning: 8,  arcana: 90, rarity: 'silver'  },
  { name: 'Aria, Moonlit Sylph',       role: 'Stalker', realm: 'Mist Vale',      img: '', power: 89, cunning: 20, arcana: 80, rarity: 'silver'  },
  { name: 'Dravak, Sand Devil',        role: 'Stalker', realm: 'Crimson Steppe', img: '', power: 48, cunning: 90, arcana: 76, rarity: 'silver'  },
  { name: 'Ilyra, Storm Harpy',        role: 'Stalker', realm: 'Stormhold',      img: '', power: 86, cunning: 55, arcana: 79, rarity: 'silver'  },
  { name: 'Bahar, Jade Oracle',        role: 'Mystic',  realm: 'Jade Delta',     img: '', power: 82, cunning: 74, arcana: 72, rarity: 'bronze'  },
  { name: 'Frost, Hoarfrost Golem',    role: 'Brute',   realm: 'Frost Reach',    img: '', power: 18, cunning: 88, arcana: 66, rarity: 'bronze'  },
  { name: 'Wren, Twilight Sprite',     role: 'Mystic',  realm: 'Duskwold',       img: '', power: 80, cunning: 5,  arcana: 83, rarity: 'bronze'  },
];

const RARITY = {
  bronze:  { color: '#b0723a', glow: 'rgba(176,114,58,.35)',   weight: 40 },
  silver:  { color: '#c9d3dd', glow: 'rgba(201,211,221,.35)',  weight: 30 },
  gold:    { color: '#e8c15a', glow: 'rgba(232,193,90,.45)',   weight: 22 },
  diamond: { color: '#7fe7ff', glow: 'rgba(127,231,255,.55)',  weight: 8  },
};
const RANK = ['bronze', 'silver', 'gold', 'diamond'];
const RARITY_LABEL = { bronze: 'Common', silver: 'Uncommon', gold: 'Rare', diamond: 'Mythic' };

/* ============================================================
   ARTIFACTS — one-use relics that drop from packs and turn the
   tide mid-battle. You can hold up to ARTIFACT_STACK of each.
   Effect fires on a turn (yours or the enemy's) and is consumed.
   ============================================================ */
const ARTIFACTS = [
  { name: 'Bloodstone Idol', icon: '🩸', tier: 'common', effect: 'double', price: 45, desc: 'Your next attack deals 2× damage' },
  { name: 'Verdant Relic',   icon: '🌿', tier: 'common', effect: 'heal',   price: 45, desc: 'Fully restores your fighter\'s health' },
  { name: 'Aegis Shard',     icon: '🛡️', tier: 'common', effect: 'shield', price: 45, desc: 'Deflects the enemy\'s next attack' },
  { name: 'Wraith Fang',     icon: '💀', tier: 'rare',   effect: 'drain',  price: 95, desc: 'Strikes for heavy damage and siphons health' },
  { name: 'Frost Sigil',     icon: '❄️', tier: 'rare',   effect: 'stun',   price: 95, desc: 'The enemy skips their next turn' },
  { name: 'Soulbrand Ember', icon: '🔥', tier: 'rare',   effect: 'triple', price: 95, desc: 'Your next attack deals 3× damage' },
];
const ARTIFACT_STACK = 3;
const BATTLE_ART_CAP = 4;         // each side can bring at most this many relics (stacked or not) into a fight
const ARTIFACT_TIER = { common: '#c8a66a', rare: '#c98bff' };
const ARTIFACT_TIER_LABEL = { common: 'Relic', rare: 'Legendary' };

/* ============================================================
   GRADING — every card hides a condition grade (1–10) that only
   the Grading Lab can reveal. Pay the fee, wait out the timer
   (three cards max at once), and pray for a 10. Low grades wreck
   a card's value; a GEM MT 10 is a collector's legend.
   ============================================================ */
const GRADE_FEE = 200;            // coins per submission
const GRADE_TIME = 3 * 60 * 1000; // how long a slab takes (3 minutes)
const GRADE_SLOTS = 3;            // max cards in the lab at once
/* chance of each grade — the lab is harsh, like grading vintage
   cards: most come back poor, gems are genuinely scarce */
const GRADE_WEIGHTS = [0, 14, 15, 16, 15, 12, 10, 8, 5, 3, 2];
/* how a grade scales a card's value */
const GRADE_MULT = { 1: 0.2, 2: 0.3, 3: 0.4, 4: 0.55, 5: 0.75, 6: 1, 7: 1.3, 8: 2.5, 9: 5, 10: 10 };
const GRADE_LABEL = { 10: 'GEM MT', 9: 'MINT', 8: 'NM–MT', 7: 'NM', 6: 'EX–NM', 5: 'EX', 4: 'VG–EX', 3: 'VG', 2: 'GD', 1: 'PR' };
const GRADE_FULL = { 10: 'Gem Mint', 9: 'Mint', 8: 'Near Mint–Mint', 7: 'Near Mint', 6: 'Excellent–Near Mint', 5: 'Excellent', 4: 'Very Good–Excellent', 3: 'Very Good', 2: 'Good', 1: 'Poor' };
const GRADE_COLOR = { 10: '#e8c15a', 9: '#5ce8a0', 8: '#7fd4ff', 7: '#c9d3dd', 6: '#c9d3dd', 5: '#c9d3dd', 4: '#e8b25a', 3: '#ff9d5c', 2: '#ff7a7a', 1: '#ff5050' };

/* ============================================================
   PRINT RUN — every minted card draws a totally random serial
   from its creature's 0001–1000 run (a low serial is a lottery
   hit), and a scarce fraction come out stamped 1ST EDITION.
   ============================================================ */
const MAX_SERIAL = 1000;          // serial pool per creature
const FIRST_ED_CHANCE = 0.04;     // chance a fresh card is 1st Edition
const FIRST_ED_MULT = 1.5;        // 1st Edition value multiplier

/* A collector's album is a single page — one slot per card. When the
   page is full (15/15), new pulls must trade into a slot: sell them,
   let them go, or give up an owned card to make room. */
const MAX_HOARD = 15;

