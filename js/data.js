/* ============================================================
   HOW TO ADD YOUR CREATURES' PHOTOS
   ------------------------------------------------------------
   1) Drop image files anywhere (e.g. a folder named "creatures").
   2) In the CREATURES list below, set that creature's "img" to the
      file path, e.g.  img: 'creatures/vorlag.jpg'
   3) Leave img: '' to use the automatic placeholder silhouette.
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

