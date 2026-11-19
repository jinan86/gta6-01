// SOLARA BAY — shared constants, city layout and mission scripts.
// Original fiction: the city of Solara Bay, driver-for-hire Dana Vega,
// dispatcher Mara Solis, fixer "Uncle" Rook Halden. No real-world names.
export const STEP = 1 / 60;
export const WORLD_W = 3200;
export const WORLD_H = 2400;
export const ROAD_HALF = 36;
export const VIEW_W = 1280;
export const VIEW_H = 720;
export const SAVE_KEY = 'solarabay.save.v1';

// Road centre lines (a regular grid the traffic AI follows).
export const ROADS_X = [200, 600, 1000, 1400, 1800, 2200, 2600, 3000];
export const ROADS_Y = [200, 600, 1000, 1400, 1800, 2200];

export const WALK_SPEED = 175;
export const CAR_ACCEL = 520;
export const CAR_BRAKE = 900;
export const CAR_MAX = 430;
export const CAR_MAX_SPORT = 540;
export const CAR_REVERSE = 170;
export const PLAYER_HP = 100;
export const START_MONEY = 120;
export const START_AMMO = 24;
export const MAX_WANTED = 5;

// Fixed landmarks (world coordinates).
export const LANDMARKS = {
  hideout: { x: 600, y: 1000, label: 'Vega Garage (Hideout)' },
  paintShop: { x: 1400, y: 2200, w: 120, h: 90, label: 'Spray Shop' },
  hospital: { x: 2600, y: 600, label: 'Bay General' },
  policeHQ: { x: 1800, y: 1400, label: 'Bay PD HQ' },
  bank: { x: 1800, y: 1000, label: 'Solara Trust Bank' },
  warehouse: { x: 2600, y: 1800, label: 'Pier 9 Warehouse' },
  marina: { x: 200, y: 1800, label: 'Marina' },
  diner: { x: 1000, y: 600, label: 'Sunset Diner' },
};

export const CAR_COLORS = ['#d94f3d', '#3d7dd9', '#e8c33a', '#e8e8e8', '#3aa655', '#8a5fd0', '#d97b2b', '#2b2b33', '#c23a6e', '#4fb8c9'];
export const PED_COLORS = ['#e8b06a', '#7ab5e8', '#e88ab0', '#9ad07a', '#d8c26a', '#b08ae8', '#e8e8e8', '#6a6a72'];

// District names, used by the HUD compass and the minimap legend.
export function districtAt(x, y) {
  if (x < 700) return 'Harbor';
  if (x > 2350 && y > 1450) return 'Industrial';
  if (y < 650 && x > 1500) return 'Northside';
  if (x > 1250 && x < 2350 && y > 750 && y < 1650) return 'Downtown';
  if (y < 650) return 'Northside';
  if (x > 2350) return 'Industrial';
  return 'Old Town';
}

// The six-mission story arc. Stages are interpreted by world.js.
export const MISSIONS = [
  {
    id: 'm1', title: 'First Fare', giver: 'Mara Solis (dispatcher)',
    reward: 150,
    brief: 'Dana, first job of the day. Pick up the client at the Sunset Diner and drive them to the Marina. Keep it smooth — no dents, no cops.',
    dialog: [
      'MARA: Dana! You finally answer your phone. First fare: Sunset Diner.',
      'DANA: On my way. Tell the client the meter is already running.',
      'MARA: Ha. Just drive, Vega. Marina, south end. Go.',
    ],
    stages: [
      { kind: 'goto', label: 'Pick up the client at Sunset Diner', at: { x: 1000, y: 600 } },
      { kind: 'carry', label: 'Drive the client to the Marina', at: { x: 200, y: 1800 } },
    ],
  },
  {
    id: 'm2', title: 'Parcel Run', giver: 'Mara Solis',
    reward: 200,
    brief: 'Three parcels, three drops, one afternoon. Harbor, Downtown, Northside. The parcels are not to be opened. Do not open the parcels.',
    dialog: [
      'MARA: Three drops. Harbor pier, Downtown bank corner, Northside clinic.',
      'DANA: What is in them?',
      'MARA: Parcels. Drive.',
    ],
    stages: [
      { kind: 'goto', label: 'Drop 1 of 3 — Harbor pier', at: { x: 200, y: 1400 } },
      { kind: 'goto', label: 'Drop 2 of 3 — Downtown corner', at: { x: 1800, y: 1000 } },
      { kind: 'goto', label: 'Drop 3 of 3 — Northside clinic', at: { x: 2600, y: 200 } },
    ],
  },
  {
    id: 'm3', title: 'Tail the Courier', giver: 'Rook Halden',
    reward: 250,
    brief: 'A rival courier is carrying Rook’s ledger across town. Follow the silver van — stay close enough to watch it, far enough not to spook it. Keep it in sight for 8 seconds.',
    dialog: [
      'ROOK: Dana. A silver van leaves the warehouse district at noon. It carries my ledger.',
      'DANA: And I am supposed to... admire it from a distance?',
      'ROOK: Follow it. Eight seconds of eyes on it and I will know its route. Do not ram it.',
    ],
    stages: [
      { kind: 'tail', label: 'Tail the silver van — keep it in sight', seconds: 8 },
    ],
  },
  {
    id: 'm4', title: 'Midnight Pickup', giver: 'Mara Solis',
    reward: 300,
    brief: 'A pickup at Pier 9 after dark. The harbor crew is jumpy and the Bay PD patrols the docks. Grab the crate, then lose the heat — break line of sight until your wanted level drops.',
    dialog: [
      'MARA: Pier 9, midnight crate. In and out, Dana.',
      'DANA: Midnight. Of course it is midnight.',
      'MARA: The crate is worth it. The cops are not. Stay unseen.',
    ],
    stages: [
      { kind: 'goto', label: 'Reach Pier 9 Warehouse', at: { x: 2600, y: 1800 } },
      { kind: 'evade', label: 'Lose the heat — stay unseen until wanted clears', seconds: 6 },
    ],
  },
  {
    id: 'm5', title: 'Warehouse Job', giver: 'Rook Halden',
    reward: 500,
    brief: 'Rook’s rivals are guarding a crate in the Pier 9 warehouse. Get past three guards — fists or the pistol, your call — grab the crate and bring it back to the garage.',
    dialog: [
      'ROOK: Three guards, one crate. My crate, technically. Bring it home.',
      'DANA: Technically.',
      'ROOK: Fists if you are feeling polite. You are not feeling polite.',
    ],
    stages: [
      { kind: 'fight', label: 'Deal with the 3 warehouse guards', count: 3 },
      { kind: 'carry', label: 'Grab the crate and return to Vega Garage', at: { x: 600, y: 1000 } },
    ],
  },
  {
    id: 'm6', title: 'The Big Score', giver: 'Rook Halden',
    reward: 1000,
    brief: 'The final job. Hit the Solara Trust Bank, grab the satchel, and get back to the garage with the whole Bay PD on your tail. Finish this and you are free of Rook — and rich.',
    dialog: [
      'ROOK: The bank. The satchel. The garage. One run, Dana, and we are done.',
      'DANA: Done-done? Or Rook-done?',
      'ROOK: Done-done. Drive like the bay is on fire. It might be.',
    ],
    stages: [
      { kind: 'goto', label: 'Reach Solara Trust Bank', at: { x: 1800, y: 1000 } },
      { kind: 'carry', label: 'Escape to Vega Garage — wanted level 3!', at: { x: 600, y: 1000 }, wanted: 3 },
    ],
  },
];

export const INTRO_LINES = [
  'SOLARA BAY — a sun-soaked port city where the tide brings in everything: fish, freight, and trouble.',
  'Dana Vega drives for whoever pays. Today the phone rang twice: Mara Solis, dispatcher, and Rook Halden, fixer.',
  'Six jobs stand between Dana and a clean slate. The city is open. The keys are in the ignition.',
];
