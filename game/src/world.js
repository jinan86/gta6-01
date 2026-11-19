// SOLARA BAY — rules and state, no drawing and no browser in it.
// The city, traffic, pedestrians, police, wanted level, six missions,
// combat, pickups, day/night clock and particles. step() advances one
// fixed step and returns what happened as bit flags.
import {
  STEP, WORLD_W, WORLD_H, ROAD_HALF, ROADS_X, ROADS_Y, WALK_SPEED,
  CAR_ACCEL, CAR_BRAKE, CAR_MAX, CAR_MAX_SPORT, CAR_REVERSE, PLAYER_HP,
  START_MONEY, START_AMMO, MAX_WANTED, LANDMARKS, CAR_COLORS, PED_COLORS,
  MISSIONS, districtAt,
} from './config.js';

export const EVENT_NONE = 0;
export const EVENT_MISSION_DONE = 1;
export const EVENT_ALL_DONE = 2;
export const EVENT_BUSTED = 4;
export const EVENT_WASTED = 8;
export const EVENT_STEAL = 16;
export const EVENT_SHOT = 32;
export const EVENT_PUNCH = 64;
export const EVENT_PICKUP = 128;
export const EVENT_CRASH = 256;
export const EVENT_REPAINT = 512;
export const EVENT_HIT = 1024;

function dist(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by);
}
function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
function angDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}
function circleHitsRect(x, y, r, b) {
  const cx = clamp(x, b.x, b.x + b.w);
  const cy = clamp(y, b.y, b.y + b.h);
  return (x - cx) * (x - cx) + (y - cy) * (y - cy) < r * r;
}
function nearestRoadX(x) {
  let best = ROADS_X[0];
  for (const r of ROADS_X) if (Math.abs(r - x) < Math.abs(best - x)) best = r;
  return best;
}
function nearestRoadY(y) {
  let best = ROADS_Y[0];
  for (const r of ROADS_Y) if (Math.abs(r - y) < Math.abs(best - y)) best = r;
  return best;
}

export function createWorld(rng) {
  const buildings = [];
  const trees = [];
  const parks = [];
  const pickups = [];
  // City blocks: between road lines. Some blocks are parks, the rest hold
  // 1-3 procedural buildings. The west strip is harbor water.
  for (let bx = 0; bx < ROADS_X.length - 1; bx += 1) {
    for (let by = 0; by < ROADS_Y.length - 1; by += 1) {
      const x0 = ROADS_X[bx] + ROAD_HALF + 8;
      const y0 = ROADS_Y[by] + ROAD_HALF + 8;
      const x1 = ROADS_X[bx + 1] - ROAD_HALF - 8;
      const y1 = ROADS_Y[by + 1] - ROAD_HALF - 8;
      const cx = (x0 + x1) / 2;
      const cy = (y0 + y1) / 2;
      const district = districtAt(cx, cy);
      if (bx === 0) continue; // harbor strip: water + docks, no buildings
      if (rng.next() < 0.16) {
        parks.push({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
        const n = 5 + rng.int(0, 5);
        for (let i = 0; i < n; i += 1) {
          trees.push({ x: x0 + 20 + rng.next() * (x1 - x0 - 40), y: y0 + 20 + rng.next() * (y1 - y0 - 40), r: 10 + rng.next() * 8 });
        }
        continue;
      }
      const count = district === 'Downtown' ? 2 : 1 + rng.int(0, 2);
      for (let i = 0; i < count; i += 1) {
        const w = 90 + rng.next() * 130;
        const h = 80 + rng.next() * 120;
        const x = x0 + rng.next() * Math.max(1, x1 - x0 - w);
        const y = y0 + rng.next() * Math.max(1, y1 - y0 - h);
        const tall = district === 'Downtown';
        buildings.push({
          x, y, w, h,
          color: tall ? rng.pick(['#5a6b8a', '#7a6a8a', '#4a7a8a', '#8a7a5a']) : rng.pick(['#b08a6a', '#8a9a7a', '#a07a7a', '#7a8a9a', '#c0a060']),
          roof: rng.pick(['#3a3f4a', '#5a4a3a', '#2f4a3f']),
          tall, district,
          seed: rng.next() * 100,
        });
      }
      if (rng.next() < 0.5) {
        trees.push({ x: x0 + 14 + rng.next() * (x1 - x0 - 28), y: y0 + 14 + rng.next() * (y1 - y0 - 28), r: 9 + rng.next() * 6 });
      }
    }
  }
  // Harbor piers.
  for (let i = 0; i < 4; i += 1) {
    buildings.push({ x: 60, y: 300 + i * 450, w: 70, h: 130, color: '#6a5a4a', roof: '#3a3f4a', tall: false, district: 'Harbor', seed: i * 7 });
  }

  const player = {
    x: LANDMARKS.hideout.x, y: LANDMARKS.hideout.y, angle: -Math.PI / 2,
    hp: PLAYER_HP, money: START_MONEY, ammo: START_AMMO,
    inCar: null, speed: 0, invuln: 0, punchTimer: 0, shootTimer: 0,
  };
  const state = {
    player, buildings, trees, parks, pickups,
    cars: [], peds: [], cops: [], bullets: [], particles: [], guards: [],
    wanted: 0, hiddenTimer: 0, bustedTimer: 0, clockMinutes: 9 * 60,
    elapsed: 0, shake: 0, missionIndex: 0, stageIndex: 0,
    dialog: null, dialogIndex: 0, missionMsg: '', missionMsgTimer: 0,
    passenger: false, allDone: false, repainted: false, tailProgress: 0,
    evadeProgress: 0, tailCar: null, stats: { stolen: 0, shots: 0, kos: 0 },
  };

  function spawnCar(kind, x, y, angle) {
    const car = {
      x, y, angle, speed: 0, hp: 100,
      color: kind === 'cop' ? '#20242e' : kind === 'taxi' ? '#e8c33a' : rng.pick(CAR_COLORS),
      kind: kind || 'sedan', driver: 'npc', maxSpeed: kind === 'sport' ? CAR_MAX_SPORT : CAR_MAX,
      roadAxis: Math.abs(Math.cos(angle)) > Math.abs(Math.sin(angle)) ? 'h' : 'v',
      lane: 14, targetSpeed: 110 + rng.next() * 70, turnTimer: 0, crashTimer: 0,
    };
    state.cars.push(car);
    return car;
  }

  function spawnTrafficCarNear(px, py) {
    const axis = rng.next() < 0.5 ? 'h' : 'v';
    if (axis === 'h') {
      const y = rng.pick(ROADS_Y);
      const x = clamp(px + (rng.next() < 0.5 ? -1 : 1) * (400 + rng.next() * 700), 120, WORLD_W - 120);
      return spawnCar(rng.next() < 0.12 ? 'sport' : rng.next() < 0.15 ? 'taxi' : 'sedan', x, y, rng.next() < 0.5 ? 0 : Math.PI);
    }
    const x = rng.pick(ROADS_X);
    const y = clamp(py + (rng.next() < 0.5 ? -1 : 1) * (400 + rng.next() * 700), 120, WORLD_H - 120);
    return spawnCar('sedan', x, y, rng.next() < 0.5 ? Math.PI / 2 : -Math.PI / 2);
  }

  function spawnPed(x, y) {
    const axis = rng.next() < 0.5 ? 'h' : 'v';
    const road = axis === 'h' ? rng.pick(ROADS_Y) : rng.pick(ROADS_X);
    const ped = {
      x: x ?? (axis === 'h' ? 150 + rng.next() * (WORLD_W - 300) : road + (rng.next() < 0.5 ? -52 : 52)),
      y: y ?? (axis === 'h' ? road + (rng.next() < 0.5 ? -52 : 52) : 150 + rng.next() * (WORLD_H - 300)),
      axis, road, dir: rng.next() < 0.5 ? 1 : -1, speed: 38 + rng.next() * 34,
      color: rng.pick(PED_COLORS), angle: 0, panic: 0, hp: 30, kind: 'ped',
    };
    state.peds.push(ped);
    return ped;
  }

  function spawnGuard(x, y) {
    const g = { x, y, hp: 60, angle: 0, shootTimer: 1 + rng.next(), speed: 60, kind: 'guard' };
    state.guards.push(g);
    return g;
  }

  function addParticles(x, y, color, n, speed) {
    for (let i = 0; i < n; i += 1) {
      const a = rng.next() * Math.PI * 2;
      const s = (speed || 120) * (0.3 + rng.next() * 0.7);
      state.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.4 + rng.next() * 0.5, max: 0.9, color, size: 2 + rng.next() * 4 });
    }
    if (state.particles.length > 400) state.particles.splice(0, state.particles.length - 400);
  }

  function addWanted(n) {
    state.wanted = clamp(state.wanted + n, 0, MAX_WANTED);
    state.hiddenTimer = 0;
  }

  function moveWithCollision(e, dx, dy, r) {
    let nx = e.x + dx;
    let blocked = false;
    for (const b of buildings) {
      if (circleHitsRect(nx, e.y, r, b)) { blocked = true; break; }
    }
    if (!blocked && nx > 30 && nx < WORLD_W - 30) e.x = nx;
    let ny = e.y + dy;
    blocked = false;
    for (const b of buildings) {
      if (circleHitsRect(e.x, ny, r, b)) { blocked = true; break; }
    }
    if (!blocked && ny > 30 && ny < WORLD_H - 30) e.y = ny;
    if (e.x < 150 && e.y > 100) { /* harbor water: keep player on the docks */ }
    return !blocked;
  }

  function nearestCar(px, py, maxDist) {
    let best = null;
    let bestD = maxDist;
    for (const c of state.cars) {
      const d = dist(px, py, c.x, c.y);
      if (d < bestD) { bestD = d; best = c; }
    }
    return best;
  }

  function enterCar() {
    const car = nearestCar(player.x, player.y, 95);
    if (!car) return 0;
    if (car.driver === 'npc') {
      // The driver bails out and becomes a pedestrian; stealing is a crime.
      const ped = spawnPed(car.x + 30, car.y + 30);
      ped.panic = 3;
      addWanted(1);
      state.stats.stolen += 1;
      car.driver = 'player';
      player.inCar = car;
      player.x = car.x;
      player.y = car.y;
      addParticles(car.x, car.y, '#e8c33a', 8, 90);
      return EVENT_STEAL;
    }
    if (car.driver === null || car.driver === 'player') {
      car.driver = 'player';
      player.inCar = car;
      player.x = car.x;
      player.y = car.y;
      return 0;
    }
    return 0;
  }

  function exitCar() {
    const car = player.inCar;
    if (!car) return;
    car.driver = null;
    car.speed = 0;
    player.inCar = null;
    player.x = car.x + Math.cos(car.angle + Math.PI / 2) * 34;
    player.y = car.y + Math.sin(car.angle + Math.PI / 2) * 34;
    player.angle = car.angle;
  }

  function punch() {
    if (player.punchTimer > 0) return 0;
    player.punchTimer = 0.45;
    const px = player.x + Math.cos(player.angle) * 34;
    const py = player.y + Math.sin(player.angle) * 34;
    let events = EVENT_PUNCH;
    let hitSomeone = false;
    const tryHit = (target, hp) => {
      if (dist(px, py, target.x, target.y) < 46) {
        target.hp -= 34;
        hitSomeone = true;
        addParticles(target.x, target.y, '#e8e8e8', 6, 100);
        return true;
      }
      return false;
    };
    for (const g of state.guards) if (tryHit(g, g.hp)) { if (g.hp <= 0) state.stats.kos += 1; }
    for (const p of state.peds) if (tryHit(p, p.hp)) {
      p.panic = 4;
      addWanted(1);
      if (p.hp <= 0) { p.hp = 0; state.stats.kos += 1; }
    }
    for (const c of state.cops) if (c.kind === 'foot' && tryHit(c, c.hp)) addWanted(1);
    if (hitSomeone) state.shake = Math.max(state.shake, 4);
    return events;
  }

  function shoot(wx, wy) {
    if (player.ammo <= 0 || player.shootTimer > 0) return 0;
    player.shootTimer = 0.28;
    player.ammo -= 1;
    state.stats.shots += 1;
    const ox = player.inCar ? player.inCar.x : player.x;
    const oy = player.inCar ? player.inCar.y : player.y;
    const a = Math.atan2(wy - oy, wx - ox);
    state.bullets.push({ x: ox + Math.cos(a) * 26, y: oy + Math.sin(a) * 26, vx: Math.cos(a) * 720, vy: Math.sin(a) * 720, life: 1.1, from: 'player', damage: 25 });
    player.angle = a;
    addParticles(ox + Math.cos(a) * 30, oy + Math.sin(a) * 30, '#ffd76a', 4, 140);
    addWanted(1);
    return EVENT_SHOT;
  }

  function startMission(index) {
    state.missionIndex = index;
    state.stageIndex = 0;
    state.tailProgress = 0;
    state.evadeProgress = 0;
    state.tailCar = null;
    state.passenger = false;
    const m = MISSIONS[index];
    if (!m) { state.allDone = true; return; }
    state.dialog = m.dialog.slice();
    state.dialogIndex = 0;
    state.missionMsg = `${m.title} — ${m.brief}`;
    state.missionMsgTimer = 6;
    if (m.id === 'm3') {
      const van = spawnCar('van', 2600, 1800, -Math.PI / 2);
      van.color = '#c9ced6';
      van.targetSpeed = 150;
      state.tailCar = van;
    }
    if (m.id === 'm5') {
      spawnGuard(2560, 1760);
      spawnGuard(2640, 1840);
      spawnGuard(2600, 1700);
    }
    if (m.id === 'm6') state.clockMinutes = 21 * 60;
  }

  function missionStage() {
    const m = MISSIONS[state.missionIndex];
    return m ? m.stages[state.stageIndex] : null;
  }

  function advanceStage() {
    const m = MISSIONS[state.missionIndex];
    state.stageIndex += 1;
    if (state.stageIndex >= m.stages.length) {
      player.money += m.reward;
      state.missionMsg = `Mission complete: ${m.title} — +$${m.reward}`;
      state.missionMsgTimer = 5;
      addParticles(player.x, player.y, '#7ae8a0', 24, 160);
      const next = state.missionIndex + 1;
      if (next >= MISSIONS.length) {
        state.allDone = true;
        state.dialog = ['DANA: Six jobs. Done. The bay is mine now — and Rook owes me nothing.', 'MARA: You did it, Vega. Solara Bay is yours. Drive safe.'];
        state.dialogIndex = 0;
        return EVENT_MISSION_DONE | EVENT_ALL_DONE;
      }
      startMission(next);
      return EVENT_MISSION_DONE;
    }
    return 0;
  }

  function updateMission(dt) {
    const m = MISSIONS[state.missionIndex];
    if (!m || state.allDone) return 0;
    const stage = m.stages[state.stageIndex];
    if (!stage) return 0;
    let events = 0;
    if (stage.kind === 'goto' || stage.kind === 'carry') {
      if (stage.wanted && state.wanted < stage.wanted && state.stageIndex === 1 && m.id === 'm6') addWanted(stage.wanted - state.wanted);
      if (dist(player.x, player.y, stage.at.x, stage.at.y) < 95) {
        if (m.id === 'm1' && state.stageIndex === 0) state.passenger = true;
        if (m.id === 'm1' && state.stageIndex === 1) state.passenger = false;
        if (m.id === 'm4' && state.stageIndex === 0) addWanted(1);
        events |= advanceStage();
      }
    } else if (stage.kind === 'tail') {
      const van = state.tailCar;
      if (van) {
        const d = dist(player.x, player.y, van.x, van.y);
        if (d < 360) state.tailProgress += dt;
        else state.tailProgress = Math.max(0, state.tailProgress - dt);
        if (state.tailProgress >= stage.seconds) events |= advanceStage();
      }
    } else if (stage.kind === 'evade') {
      let seen = false;
      for (const c of state.cops) if (dist(player.x, player.y, c.x, c.y) < 420) seen = true;
      if (!seen && state.wanted === 0) state.evadeProgress += dt;
      else state.evadeProgress = Math.max(0, state.evadeProgress - dt * 0.5);
      if (state.evadeProgress >= stage.seconds) events |= advanceStage();
    } else if (stage.kind === 'fight') {
      const down = state.guards.filter((g) => g.hp <= 0).length;
      if (down >= stage.count) events |= advanceStage();
    }
    return events;
  }

  function updateTraffic(dt) {
    for (const car of state.cars) {
      // Only NPC-driven cars are traffic: parked cars (driver null) stay
      // parked, the player's car is driven by the player, cop cars are
      // driven by updatePolice.
      if (car.driver !== 'npc') continue;
      // Follow the road grid: drive along the current axis; at an
      // intersection sometimes turn onto the cross road.
      car.turnTimer -= dt;
      const onX = nearestRoadX(car.x);
      const onY = nearestRoadY(car.y);
      if (car.roadAxis === 'h') {
        const targetY = onY + (Math.sin(car.angle) >= 0 ? car.lane : -car.lane);
        car.y += clamp(targetY - car.y, -40 * dt, 40 * dt);
        car.angle += angDiff(Math.cos(car.angle) >= 0 ? 0 : Math.PI, car.angle) * Math.min(1, 2 * dt);
        car.speed += (car.targetSpeed - car.speed) * Math.min(1, dt);
        car.x += Math.cos(car.angle) * car.speed * dt;
        if (car.turnTimer <= 0 && Math.abs(car.x - onX) < 24) {
          car.turnTimer = 2 + rng.next() * 3;
          if (rng.next() < 0.35) {
            car.roadAxis = 'v';
            car.angle = rng.next() < 0.5 ? Math.PI / 2 : -Math.PI / 2;
            car.x = onX + (car.angle > 0 ? -car.lane : car.lane);
          }
        }
      } else {
        const targetX = onX + (Math.cos(car.angle) >= 0 ? car.lane : -car.lane);
        car.x += clamp(targetX - car.x, -40 * dt, 40 * dt);
        car.angle += angDiff(Math.sin(car.angle) >= 0 ? Math.PI / 2 : -Math.PI / 2, car.angle) * Math.min(1, 2 * dt);
        car.speed += (car.targetSpeed - car.speed) * Math.min(1, dt);
        car.y += Math.sin(car.angle) * car.speed * dt;
        if (car.turnTimer <= 0 && Math.abs(car.y - onY) < 24) {
          car.turnTimer = 2 + rng.next() * 3;
          if (rng.next() < 0.35) {
            car.roadAxis = 'h';
            car.angle = rng.next() < 0.5 ? 0 : Math.PI;
            car.y = onY + (car.angle === 0 ? car.lane : -car.lane);
          }
        }
      }
      // Keep inside the world; U-turn at the edges.
      if (car.x < 140 || car.x > WORLD_W - 140 || car.y < 140 || car.y > WORLD_H - 140) {
        car.angle += Math.PI;
        car.x = clamp(car.x, 160, WORLD_W - 160);
        car.y = clamp(car.y, 160, WORLD_H - 160);
      }
      // Tail van keeps a steady cruise so the player can follow it.
      if (car === state.tailCar) car.speed = car.targetSpeed;
    }
    // Gentle car-car separation so traffic does not pile up.
    for (let i = 0; i < state.cars.length; i += 1) {
      for (let j = i + 1; j < state.cars.length; j += 1) {
        const a = state.cars[i];
        const b = state.cars[j];
        const d = dist(a.x, a.y, b.x, b.y);
        if (d > 0.01 && d < 46) {
          const push = (46 - d) / 2;
          const nx = (b.x - a.x) / d;
          const ny = (b.y - a.y) / d;
          a.x -= nx * push;
          a.y -= ny * push;
          b.x += nx * push;
          b.y += ny * push;
          if (a.driver !== 'player' && Math.abs(a.speed) > 120) a.speed *= 0.7;
          if (b.driver !== 'player' && Math.abs(b.speed) > 120) b.speed *= 0.7;
        }
      }
    }
  }

  function updatePeds(dt) {
    for (const p of state.peds) {
      if (p.hp <= 0) continue;
      if (p.panic > 0) {
        p.panic -= dt;
        p.x += Math.cos(p.angle) * 220 * dt;
        p.y += Math.sin(p.angle) * 220 * dt;
        continue;
      }
      const speed = p.speed;
      if (p.axis === 'h') {
        p.x += p.dir * speed * dt;
        p.y += clamp(p.road + (p.y < p.road ? -52 : 52) - p.y, -30 * dt, 30 * dt);
        p.angle = p.dir > 0 ? 0 : Math.PI;
        if (p.x < 160 || p.x > WORLD_W - 160) p.dir *= -1;
        const cross = nearestRoadX(p.x);
        if (Math.abs(p.x - cross) < 8 && rng.next() < 0.004) {
          p.axis = 'v';
          p.road = cross;
          p.dir = rng.next() < 0.5 ? 1 : -1;
        }
      } else {
        p.y += p.dir * speed * dt;
        p.x += clamp(p.road + (p.x < p.road ? -52 : 52) - p.x, -30 * dt, 30 * dt);
        p.angle = p.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
        if (p.y < 160 || p.y > WORLD_H - 160) p.dir *= -1;
        const cross = nearestRoadY(p.y);
        if (Math.abs(p.y - cross) < 8 && rng.next() < 0.004) {
          p.axis = 'h';
          p.road = cross;
          p.dir = rng.next() < 0.5 ? 1 : -1;
        }
      }
    }
  }

  function updatePolice(dt) {
    const wanted = state.wanted;
    const wantCars = wanted > 0 ? Math.min(wanted + 1, 5) : 0;
    const wantFoot = wanted >= 2 ? Math.min(wanted, 3) : 0;
    const copCars = state.cops.filter((c) => c.kind === 'car');
    const copFoot = state.cops.filter((c) => c.kind === 'foot');
    if (copCars.length < wantCars) {
      const a = rng.next() * Math.PI * 2;
      const x = clamp(player.x + Math.cos(a) * 750, 200, WORLD_W - 200);
      const y = clamp(player.y + Math.sin(a) * 750, 200, WORLD_H - 200);
      const car = spawnCar('cop', nearestRoadX(x), nearestRoadY(y), 0);
      car.driver = 'cop';
      car.targetSpeed = 260 + wanted * 30;
      state.cops.push({ kind: 'car', car, x: car.x, y: car.y, angle: 0, speed: 0, hp: 100 });
    }
    if (copFoot.length < wantFoot) {
      const a = rng.next() * Math.PI * 2;
      const cop = { kind: 'foot', x: clamp(player.x + Math.cos(a) * 500, 100, WORLD_W - 100), y: clamp(player.y + Math.sin(a) * 500, 100, WORLD_H - 100), angle: 0, speed: 195, hp: 60 };
      state.cops.push(cop);
    }
    if (wanted === 0) {
      // No heat: cops drive off and despawn.
      for (const c of state.cops) {
        if (c.kind === 'car' && c.car) {
          c.car.driver = 'npc';
          c.car.kind = 'sedan';
          c.car.color = rng.pick(CAR_COLORS);
        }
      }
      state.cops.length = 0;
      return;
    }
    let nearestCop = Infinity;
    for (const c of state.cops) {
      if (c.kind === 'car' && c.car) {
        const car = c.car;
        const target = Math.atan2(player.y - car.y, player.x - car.x);
        car.angle += clamp(angDiff(target, car.angle), -2.4 * dt, 2.4 * dt);
        car.speed += ((300 + wanted * 35) - car.speed) * Math.min(1, dt * 1.2);
        const nx = car.x + Math.cos(car.angle) * car.speed * dt;
        const ny = car.y + Math.sin(car.angle) * car.speed * dt;
        let blocked = false;
        for (const b of buildings) if (circleHitsRect(nx, ny, 18, b)) { blocked = true; break; }
        if (!blocked) { car.x = nx; car.y = ny; } else { car.angle += Math.PI / 2; car.speed *= 0.5; }
        car.x = clamp(car.x, 120, WORLD_W - 120);
        car.y = clamp(car.y, 120, WORLD_H - 120);
        c.x = car.x;
        c.y = car.y;
        // Ramming the player on foot hurts.
        if (!player.inCar && dist(car.x, car.y, player.x, player.y) < 34 && player.invuln <= 0) {
          player.hp -= 12;
          player.invuln = 0.8;
          state.shake = Math.max(state.shake, 7);
          addParticles(player.x, player.y, '#e84f3d', 10, 140);
        }
        nearestCop = Math.min(nearestCop, dist(car.x, car.y, player.x, player.y));
      } else if (c.kind === 'foot') {
        const target = Math.atan2(player.y - c.y, player.x - c.x);
        c.angle = target;
        moveWithCollision(c, Math.cos(target) * c.speed * dt, Math.sin(target) * c.speed * dt, 12);
        nearestCop = Math.min(nearestCop, dist(c.x, c.y, player.x, player.y));
        if (!player.inCar && dist(c.x, c.y, player.x, player.y) < 30) {
          state.bustedTimer += dt;
        }
      }
    }
    // Wanted decays only while no cop can see the player.
    if (nearestCop > 460) {
      state.hiddenTimer += dt;
      if (state.hiddenTimer > 6) {
        state.wanted = Math.max(0, state.wanted - 1);
        state.hiddenTimer = 0;
      }
    } else {
      state.hiddenTimer = 0;
    }
    if (player.inCar) state.bustedTimer = Math.max(0, state.bustedTimer - dt);
  }

  function updateGuards(dt) {
    for (const g of state.guards) {
      if (g.hp <= 0) continue;
      const d = dist(g.x, g.y, player.x, player.y);
      g.angle = Math.atan2(player.y - g.y, player.x - g.x);
      if (d < 380) {
        g.shootTimer -= dt;
        if (g.shootTimer <= 0) {
          g.shootTimer = 1.1 + rng.next() * 0.7;
          const a = g.angle + (rng.next() - 0.5) * 0.2;
          state.bullets.push({ x: g.x + Math.cos(a) * 22, y: g.y + Math.sin(a) * 22, vx: Math.cos(a) * 520, vy: Math.sin(a) * 520, life: 1.2, from: 'guard', damage: 10 });
        }
      }
      if (d < 220 && d > 60) {
        moveWithCollision(g, Math.cos(g.angle) * g.speed * dt, Math.sin(g.angle) * g.speed * dt, 12);
      }
    }
  }

  function updateBullets(dt) {
    for (let i = state.bullets.length - 1; i >= 0; i -= 1) {
      const b = state.bullets[i];
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      let dead = b.life <= 0 || b.x < 0 || b.x > WORLD_W || b.y < 0 || b.y > WORLD_H;
      if (!dead) {
        for (const bl of buildings) {
          if (b.x > bl.x && b.x < bl.x + bl.w && b.y > bl.y && b.y < bl.y + bl.h) { dead = true; break; }
        }
      }
      if (!dead) {
        const hitList = b.from === 'player'
          ? [...state.peds, ...state.guards, ...state.cops.filter((c) => c.kind === 'foot')]
          : [player];
        for (const t of hitList) {
          if (t.hp > 0 && dist(b.x, b.y, t.x, t.y) < 16) {
            t.hp -= b.damage;
            addParticles(b.x, b.y, '#e84f3d', 6, 110);
            if (b.from === 'player' && t.kind === 'ped') addWanted(1);
            if (b.from === 'guard' && t === player && player.invuln <= 0) {
              player.invuln = 0.4;
              state.shake = Math.max(state.shake, 5);
            }
            if (t.hp <= 0 && b.from === 'player') state.stats.kos += 1;
            dead = true;
            break;
          }
        }
      }
      if (!dead && b.from === 'player') {
        for (const car of state.cars) {
          if (car.driver === 'player') continue;
          if (dist(b.x, b.y, car.x, car.y) < 24) {
            car.hp -= 12;
            addParticles(b.x, b.y, '#ffd76a', 6, 120);
            if (car.hp <= 0) {
              addParticles(car.x, car.y, '#e84f3d', 30, 260);
              addParticles(car.x, car.y, '#3a3f4a', 20, 140);
              state.shake = Math.max(state.shake, 10);
              car.hp = 0;
              car.driver = null;
            }
            dead = true;
            break;
          }
        }
      }
      if (dead) state.bullets.splice(i, 1);
    }
  }

  function updatePickups() {
    for (const p of pickups) {
      if (p.taken) continue;
      if (dist(player.x, player.y, p.x, p.y) < 34) {
        p.taken = true;
        if (p.kind === 'ammo') player.ammo += 12;
        else player.hp = Math.min(PLAYER_HP, player.hp + 40);
        addParticles(p.x, p.y, '#7ae8a0', 12, 120);
        state.missionMsg = p.kind === 'ammo' ? 'Picked up ammo (+12)' : 'Picked up a medkit (+40 HP)';
        state.missionMsgTimer = 2.5;
      }
    }
  }

  function updatePlayerCar(dt, input) {
    const car = player.inCar;
    const max = car.maxSpeed;
    const forward = (input.up ? 1 : 0) - (input.down ? 0.6 : 0);
    if (input.up) car.speed += CAR_ACCEL * dt;
    else if (input.down) car.speed -= (car.speed > 0 ? CAR_BRAKE : CAR_ACCEL * 0.6) * dt;
    else car.speed -= car.speed * 0.7 * dt;
    car.speed = clamp(car.speed, -CAR_REVERSE, max);
    const steer = (input.left ? -1 : 0) + (input.right ? 1 : 0);
    if (Math.abs(car.speed) > 8 || input.up) {
      // A stopped car can still begin to turn while pulling away; a
      // rolling car steers in proportion to its speed.
      const authority = Math.abs(car.speed) > 8 ? Math.min(1, Math.abs(car.speed) / 160) : 0.35;
      car.angle += steer * (car.speed >= 0 ? 1 : -1) * 2.1 * dt * authority;
    }
    const nx = car.x + Math.cos(car.angle) * car.speed * dt;
    const ny = car.y + Math.sin(car.angle) * car.speed * dt;
    if (car.crashTimer > 0) car.crashTimer -= dt;
    let blocked = false;
    for (const b of buildings) if (circleHitsRect(nx, ny, 18, b)) { blocked = true; break; }
    if (blocked) {
      // One crash per half-second, not per frame: ramming a wall should
      // hurt, not instantly total the car.
      if (car.crashTimer <= 0) {
        car.crashTimer = 0.6;
        if (Math.abs(car.speed) > 220) {
          player.hp -= 6;
          player.invuln = Math.max(player.invuln, 0.5);
          addParticles(car.x, car.y, '#e8c33a', 10, 150);
          state.shake = Math.max(state.shake, 8);
        }
        car.hp -= 4;
      }
      car.speed *= -0.25;
    } else {
      car.x = nx;
      car.y = ny;
    }
    car.x = clamp(car.x, 100, WORLD_W - 100);
    car.y = clamp(car.y, 100, WORLD_H - 100);
    player.x = car.x;
    player.y = car.y;
    player.angle = car.angle;
    if (car.hp < 55 && rng.next() < dt * 8) {
      addParticles(car.x - Math.cos(car.angle) * 18, car.y - Math.sin(car.angle) * 18, '#8a8f9a', 1, 40);
    }
    if (car.hp <= 0) {
      addParticles(car.x, car.y, '#e84f3d', 30, 260);
      state.shake = Math.max(state.shake, 10);
      player.hp -= 20;
      exitCar();
      player.x = car.x + 40;
      player.y = car.y + 40;
    }
    // Spray shop: drive through to lose the heat (costs $50).
    const ps = LANDMARKS.paintShop;
    if (car.x > ps.x - ps.w / 2 && car.x < ps.x + ps.w / 2 && car.y > ps.y - ps.h / 2 && car.y < ps.y + ps.h / 2) {
      if (state.wanted > 0 && player.money >= 50 && !state.repainted) {
        state.repainted = true;
        player.money -= 50;
        state.wanted = 0;
        state.cops.length = 0;
        state.missionMsg = 'Fresh paint — wanted level cleared (-$50)';
        state.missionMsgTimer = 4;
        addParticles(car.x, car.y, '#7ab5e8', 20, 140);
      }
    } else {
      state.repainted = false;
    }
  }

  function updatePlayerFoot(dt, input) {
    let mx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    let my = (input.down ? 1 : 0) - (input.up ? 1 : 0);
    const len = Math.hypot(mx, my);
    if (len > 0) {
      mx /= len;
      my /= len;
      player.angle = Math.atan2(my, mx);
      player.speed = WALK_SPEED;
      moveWithCollision(player, mx * WALK_SPEED * dt, my * WALK_SPEED * dt, 12);
    } else {
      player.speed = 0;
    }
    // Walking into a moving car hurts.
    for (const car of state.cars) {
      if (car.driver === 'player') continue;
      if (dist(player.x, player.y, car.x, car.y) < 26 && Math.abs(car.speed) > 60 && player.invuln <= 0) {
        player.hp -= 10;
        player.invuln = 0.9;
        state.shake = Math.max(state.shake, 7);
        addParticles(player.x, player.y, '#e84f3d', 8, 130);
      }
    }
    // Spray shop on foot does nothing; paint needs a car.
  }

  function reset() {
    player.x = LANDMARKS.hideout.x;
    player.y = LANDMARKS.hideout.y;
    player.angle = -Math.PI / 2;
    player.hp = PLAYER_HP;
    player.money = START_MONEY;
    player.ammo = START_AMMO;
    player.inCar = null;
    player.speed = 0;
    player.invuln = 0;
    state.cars.length = 0;
    state.peds.length = 0;
    state.cops.length = 0;
    state.bullets.length = 0;
    state.particles.length = 0;
    state.guards.length = 0;
    state.wanted = 0;
    state.hiddenTimer = 0;
    state.bustedTimer = 0;
    state.clockMinutes = 9 * 60;
    state.elapsed = 0;
    state.shake = 0;
    state.missionIndex = 0;
    state.stageIndex = 0;
    state.dialog = null;
    state.dialogIndex = 0;
    state.missionMsg = '';
    state.missionMsgTimer = 0;
    state.passenger = false;
    state.allDone = false;
    state.tailCar = null;
    state.tailProgress = 0;
    state.evadeProgress = 0;
    state.stats = { stolen: 0, shots: 0, kos: 0 };
    for (const p of pickups) p.taken = false;
    // Parked cars around the hideout + traffic + pedestrians.
    spawnCar('sedan', 640, 1000, 0).driver = null;
    spawnCar('taxi', 600, 940, Math.PI / 2).driver = 'npc';
    spawnCar('sport', 1400, 600, Math.PI).driver = null;
    for (let i = 0; i < 12; i += 1) spawnTrafficCarNear(player.x, player.y);
    for (let i = 0; i < 26; i += 1) spawnPed();
    // Pickups: ammo + medkits at fixed spots.
    pickups.length = 0;
    const spots = [
      { kind: 'ammo', x: 1000, y: 640 }, { kind: 'ammo', x: 1800, y: 1040 },
      { kind: 'ammo', x: 2600, y: 1840 }, { kind: 'health', x: 2600, y: 640 },
      { kind: 'health', x: 600, y: 1400 }, { kind: 'ammo', x: 1400, y: 2200 },
      { kind: 'health', x: 2200, y: 1000 }, { kind: 'ammo', x: 200, y: 1000 },
    ];
    for (const s of spots) pickups.push({ ...s, taken: false });
    startMission(0);
  }

  function step(dt, input, opts) {
    const harmless = opts && opts.harmless;
    let events = EVENT_NONE;
    state.elapsed += dt;
    state.clockMinutes = (state.clockMinutes + dt * 6) % (24 * 60);
    if (state.missionMsgTimer > 0) state.missionMsgTimer -= dt;
    if (state.shake > 0) state.shake = Math.max(0, state.shake - dt * 22);
    if (player.invuln > 0) player.invuln -= dt;
    if (player.punchTimer > 0) player.punchTimer -= dt;
    if (player.shootTimer > 0) player.shootTimer -= dt;

    // Dialog advances one line per confirm; the world keeps running behind it.
    if (state.dialog && input && input.dialogAdvance) {
      state.dialogIndex += 1;
      if (state.dialogIndex >= state.dialog.length) state.dialog = null;
    }
    const dialogOpen = !!state.dialog;

    updateTraffic(dt);
    updatePeds(dt);
    updatePolice(dt);
    updateGuards(dt);
    updateBullets(dt);
    for (let i = state.particles.length - 1; i >= 0; i -= 1) {
      const p = state.particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.96;
      p.vy *= 0.96;
      p.life -= dt;
      if (p.life <= 0) state.particles.splice(i, 1);
    }

    if (!harmless && !dialogOpen && input) {
      if (input.enter) {
        if (player.inCar) exitCar();
        else events |= enterCar();
      }
      if (input.punch) events |= punch();
      if (input.shoot) events |= shoot(input.shoot.x, input.shoot.y);
      if (player.inCar) updatePlayerCar(dt, input);
      else updatePlayerFoot(dt, input);
      events |= updateMission(dt);
      updatePickups();
    } else if (!harmless && dialogOpen) {
      // During dialog the player stands still; the city lives on.
      if (player.inCar) { player.inCar.speed *= 0.95; }
    }

    // Busted: a foot cop holds the player long enough.
    if (state.bustedTimer > 1.2) {
      state.bustedTimer = 0;
      return events | EVENT_BUSTED;
    }
    if (player.hp <= 0) {
      player.hp = 0;
      return events | EVENT_WASTED;
    }
    return events;
  }

  function getSave() {
    return {
      missionIndex: state.missionIndex,
      stageIndex: state.stageIndex,
      money: player.money,
      hp: player.hp,
      ammo: player.ammo,
      x: player.x,
      y: player.y,
      clockMinutes: state.clockMinutes,
      wanted: state.wanted,
    };
  }

  function applySave(save) {
    reset();
    state.missionIndex = save.missionIndex || 0;
    state.stageIndex = save.stageIndex || 0;
    player.money = save.money ?? START_MONEY;
    player.hp = save.hp ?? PLAYER_HP;
    player.ammo = save.ammo ?? START_AMMO;
    player.x = save.x ?? LANDMARKS.hideout.x;
    player.y = save.y ?? LANDMARKS.hideout.y;
    state.clockMinutes = save.clockMinutes ?? 9 * 60;
    state.wanted = save.wanted ?? 0;
    state.dialog = null;
    const m = MISSIONS[state.missionIndex];
    if (m) {
      state.missionMsg = `${m.title} — ${m.stages[state.stageIndex] ? m.stages[state.stageIndex].label : ''}`;
      state.missionMsgTimer = 5;
    }
    if (state.missionIndex === 4 || state.missionIndex === 5) {
      // Guards belong to mission 5; re-spawn them if the save is mid-job.
      if (state.missionIndex === 4 && state.stageIndex === 0) {
        spawnGuard(2560, 1760);
        spawnGuard(2640, 1840);
        spawnGuard(2600, 1700);
      }
    }
  }

  reset();
  return {
    state, reset, step, startMission, missionStage, enterCar, shoot, punch,
    addWanted, getSave, applySave, districtAt,
    objective() {
      const stage = missionStage();
      if (state.allDone) return 'All missions complete — Solara Bay is yours.';
      if (!stage) return '';
      const m = MISSIONS[state.missionIndex];
      return `${m.title} (${state.missionIndex + 1}/6): ${stage.label}`;
    },
  };
}
