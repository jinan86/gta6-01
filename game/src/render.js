// Drawing only: the world's state and the current screen in, pixels out.
// Top-down procedural art — every building, car, tree and face is drawn
// with canvas shapes. Camera follows the player with screen shake; a
// day/night overlay, HUD, minimap, mission marker, dialogs and menus.
import { WORLD_W, WORLD_H, ROAD_HALF, ROADS_X, ROADS_Y, VIEW_W, VIEW_H, LANDMARKS, MISSIONS, INTRO_LINES, districtAt } from './config.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_BUSTED = 'busted';
export const SCREEN_WASTED = 'wasted';
export const SCREEN_DONE = 'done';

const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';
const MINIMAP = { x: VIEW_W - 216, y: 16, w: 200, h: 150 };

function fmtClock(minutes) {
  const h = Math.floor(minutes / 60) % 24;
  const m = Math.floor(minutes % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0, dpr: 1 };
  const cam = { x: 600, y: 1000 };
  const fonts = new Map();

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    view.dpr = dpr;
    canvas.width = Math.round(window.innerWidth * dpr);
    canvas.height = Math.round(window.innerHeight * dpr);
    view.scale = Math.min(canvas.width / VIEW_W, canvas.height / VIEW_H);
    view.x = (canvas.width - VIEW_W * view.scale) / 2;
    view.y = (canvas.height - VIEW_H * view.scale) / 2;
  }

  function text(value, x, y, size, color, align, weight) {
    const key = `${size}|${weight || ''}`;
    if (!fonts.has(key)) fonts.set(key, `${weight || ''} ${size}px ${FONT}`);
    ctx.font = fonts.get(key);
    ctx.fillStyle = color;
    ctx.textAlign = align || 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(value, x, y);
  }

  function rr(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawCar(car, isPlayer) {
    ctx.save();
    ctx.translate(car.x, car.y);
    ctx.rotate(car.angle);
    const w = 46;
    const h = 22;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    rr(-w / 2 + 3, -h / 2 + 4, w, h, 6);
    ctx.fill();
    ctx.fillStyle = car.color;
    rr(-w / 2, -h / 2, w, h, 6);
    ctx.fill();
    ctx.fillStyle = car.kind === 'cop' ? '#e8e8e8' : 'rgba(20,24,32,0.85)';
    ctx.fillRect(2, -h / 2 + 3, 12, h - 6);
    ctx.fillStyle = 'rgba(180,220,255,0.75)';
    ctx.fillRect(-8, -h / 2 + 4, 8, h - 8);
    if (car.kind === 'cop') {
      ctx.fillStyle = '#e84f3d';
      ctx.fillRect(-w / 2 + 4, -h / 2 + 2, 8, 4);
      ctx.fillStyle = '#3d7dd9';
      ctx.fillRect(-w / 2 + 4, h / 2 - 6, 8, 4);
      ctx.fillStyle = '#e8e8e8';
      ctx.font = `bold 8px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText('PD', 8, 3);
    }
    if (car.kind === 'taxi') {
      ctx.fillStyle = '#20242e';
      ctx.font = `bold 8px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText('TAXI', -2, 3);
    }
    // Headlights.
    ctx.fillStyle = 'rgba(255,240,180,0.9)';
    ctx.fillRect(w / 2 - 2, -h / 2 + 2, 3, 4);
    ctx.fillRect(w / 2 - 2, h / 2 - 6, 3, 4);
    if (car.hp < 55 && car.hp > 0) {
      ctx.fillStyle = 'rgba(120,125,135,0.7)';
      ctx.beginPath();
      ctx.arc(-w / 2 + 4, 0, 5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    if (isPlayer) {
      ctx.strokeStyle = '#7ae8a0';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(car.x, car.y, 32, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  function drawPed(p, time) {
    const bob = Math.sin(time * 10 + p.x) * 1.5;
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(p.x, p.y + 8, 8, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y + bob * 0.3, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#e8c9a0';
    ctx.beginPath();
    ctx.arc(p.x + Math.cos(p.angle) * 3, p.y + Math.sin(p.angle) * 3 + bob * 0.3, 5, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawWorld(state, time) {
    const p = state.player;
    // Camera: follow the player, clamped to the world, plus shake.
    const tx = p.x - VIEW_W / 2;
    const ty = p.y - VIEW_H / 2;
    cam.x += (tx - cam.x) * 0.12;
    cam.y += (ty - cam.y) * 0.12;
    cam.x = Math.max(0, Math.min(WORLD_W - VIEW_W, cam.x));
    cam.y = Math.max(0, Math.min(WORLD_H - VIEW_H, cam.y));
    const shx = state.shake > 0 ? (Math.random() - 0.5) * state.shake : 0;
    const shy = state.shake > 0 ? (Math.random() - 0.5) * state.shake : 0;
    const ox = -cam.x + shx;
    const oy = -cam.y + shy;

    ctx.save();
    ctx.translate(ox, oy);

    // Ground: grass base, harbor water on the west edge.
    ctx.fillStyle = '#5a7a4a';
    ctx.fillRect(cam.x - 40, cam.y - 40, VIEW_W + 80, VIEW_H + 80);
    ctx.fillStyle = '#2f6a8a';
    ctx.fillRect(0, 0, 140, WORLD_H);
    ctx.fillStyle = '#3f8ab0';
    for (let y = 0; y < WORLD_H; y += 120) {
      ctx.fillRect(20, y + 30, 100, 6);
    }
    // Docks.
    ctx.fillStyle = '#8a6a4a';
    for (let i = 0; i < 4; i += 1) ctx.fillRect(120, 320 + i * 450, 30, 120);

    // Sidewalks (blocks) then roads.
    ctx.fillStyle = '#9a9a92';
    for (let bx = 0; bx < ROADS_X.length - 1; bx += 1) {
      for (let by = 0; by < ROADS_Y.length - 1; by += 1) {
        if (bx === 0) continue;
        ctx.fillRect(ROADS_X[bx] + ROAD_HALF, ROADS_Y[by] + ROAD_HALF, ROADS_X[bx + 1] - ROADS_X[bx] - ROAD_HALF * 2, ROADS_Y[by + 1] - ROADS_Y[by] - ROAD_HALF * 2);
      }
    }
    ctx.fillStyle = '#3a3d44';
    for (const x of ROADS_X) ctx.fillRect(x - ROAD_HALF, 0, ROAD_HALF * 2, WORLD_H);
    for (const y of ROADS_Y) ctx.fillRect(0, y - ROAD_HALF, WORLD_W, ROAD_HALF * 2);
    // Lane dashes.
    ctx.fillStyle = '#d8c85a';
    for (const x of ROADS_X) {
      for (let y = 0; y < WORLD_H; y += 64) ctx.fillRect(x - 2, y, 4, 30);
    }
    for (const y of ROADS_Y) {
      for (let x = 0; x < WORLD_W; x += 64) ctx.fillRect(x, y - 2, 30, 4);
    }

    // Parks.
    for (const park of state.parks) {
      ctx.fillStyle = '#4a7a3a';
      ctx.fillRect(park.x, park.y, park.w, park.h);
    }
    // Spray shop zone.
    const ps = LANDMARKS.paintShop;
    ctx.fillStyle = '#c96a3a';
    ctx.fillRect(ps.x - ps.w / 2, ps.y - ps.h / 2, ps.w, ps.h);
    ctx.fillStyle = '#e8e8e8';
    ctx.font = `bold 11px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText('SPRAY SHOP', ps.x, ps.y + 4);
    // Landmark labels.
    ctx.fillStyle = 'rgba(232,232,232,0.9)';
    ctx.font = `11px ${FONT}`;
    ctx.fillText('VEGA GARAGE', LANDMARKS.hideout.x, LANDMARKS.hideout.y - 60);
    ctx.fillText('SOLARA TRUST BANK', LANDMARKS.bank.x, LANDMARKS.bank.y - 60);
    ctx.fillText('PIER 9 WAREHOUSE', LANDMARKS.warehouse.x, LANDMARKS.warehouse.y - 60);
    ctx.fillText('BAY GENERAL', LANDMARKS.hospital.x, LANDMARKS.hospital.y - 60);
    ctx.fillText('BAY PD HQ', LANDMARKS.policeHQ.x, LANDMARKS.policeHQ.y - 60);

    // Buildings.
    for (const b of state.buildings) {
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.fillRect(b.x + 5, b.y + 6, b.w, b.h);
      ctx.fillStyle = b.color;
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.fillStyle = b.roof;
      ctx.fillRect(b.x + 6, b.y + 6, b.w - 12, b.h - 12);
      ctx.fillStyle = 'rgba(255,240,180,0.85)';
      const cols = Math.max(2, Math.floor(b.w / 26));
      const rows = Math.max(2, Math.floor(b.h / 26));
      for (let i = 0; i < cols; i += 1) {
        for (let j = 0; j < rows; j += 1) {
          if (((i * 7 + j * 13 + Math.floor(b.seed)) % 5) < 2) {
            ctx.fillRect(b.x + 12 + i * ((b.w - 24) / cols), b.y + 12 + j * ((b.h - 24) / rows), 7, 7);
          }
        }
      }
      if (b.tall) {
        ctx.fillStyle = 'rgba(255,255,255,0.25)';
        ctx.fillRect(b.x + b.w / 2 - 2, b.y - 10, 4, 10);
      }
    }
    // Trees.
    for (const t of state.trees) {
      ctx.fillStyle = '#2f5a2a';
      ctx.beginPath();
      ctx.arc(t.x, t.y, t.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#4a8a3a';
      ctx.beginPath();
      ctx.arc(t.x - 3, t.y - 3, t.r * 0.7, 0, Math.PI * 2);
      ctx.fill();
    }

    // Pickups.
    for (const pk of state.pickups) {
      if (pk.taken) continue;
      const pulse = 1 + Math.sin(time * 4 + pk.x) * 0.15;
      ctx.fillStyle = pk.kind === 'ammo' ? '#e8c33a' : '#e87a7a';
      ctx.save();
      ctx.translate(pk.x, pk.y);
      ctx.scale(pulse, pulse);
      ctx.fillRect(-9, -9, 18, 18);
      ctx.fillStyle = '#20242e';
      ctx.font = `bold 12px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText(pk.kind === 'ammo' ? 'A' : '+', 0, 4);
      ctx.restore();
    }

    // Mission marker: beacon column + pulsing ring.
    const stage = currentStage(state);
    if (stage && stage.at) {
      const pulse = 26 + Math.sin(time * 5) * 6;
      ctx.fillStyle = 'rgba(232,195,58,0.25)';
      ctx.beginPath();
      ctx.arc(stage.at.x, stage.at.y, pulse + 26, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#e8c33a';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(stage.at.x, stage.at.y, pulse, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = '#e8c33a';
      ctx.beginPath();
      ctx.moveTo(stage.at.x, stage.at.y - 46);
      ctx.lineTo(stage.at.x - 12, stage.at.y - 22);
      ctx.lineTo(stage.at.x + 12, stage.at.y - 22);
      ctx.closePath();
      ctx.fill();
    }
    if (state.tailCar) {
      ctx.strokeStyle = '#e8c33a';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(state.tailCar.x, state.tailCar.y, 40 + Math.sin(time * 5) * 5, 0, Math.PI * 2);
      ctx.stroke();
    }
    for (const g of state.guards) {
      if (g.hp <= 0) continue;
      drawPed({ x: g.x, y: g.y, angle: g.angle, color: '#5a2a2a' }, time);
      ctx.fillStyle = '#e84f3d';
      ctx.fillRect(g.x - 12, g.y - 22, 24, 4);
      ctx.fillStyle = '#7ae8a0';
      ctx.fillRect(g.x - 12, g.y - 22, 24 * Math.max(0, g.hp / 60), 4);
    }

    // Cars, pedestrians, cops, player.
    for (const car of state.cars) drawCar(car, car === state.player.inCar);
    for (const cop of state.cops) {
      if (cop.kind === 'foot') {
        drawPed({ x: cop.x, y: cop.y, angle: cop.angle, color: '#20242e' }, time);
        ctx.fillStyle = '#3d7dd9';
        ctx.beginPath();
        ctx.arc(cop.x, cop.y - 8, 5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    for (const pd of state.peds) if (pd.hp > 0) drawPed(pd, time);
    if (!state.player.inCar) {
      const pl = state.player;
      const bob = Math.sin(time * 12) * 1.2;
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath();
      ctx.ellipse(pl.x, pl.y + 9, 9, 4, 0, 0, Math.PI * 2);
      ctx.fill();
      // Dana Vega: teal jacket, dark hair.
      ctx.fillStyle = '#2a9a8a';
      ctx.beginPath();
      ctx.arc(pl.x, pl.y + bob * 0.3, 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#e8c9a0';
      ctx.beginPath();
      ctx.arc(pl.x + Math.cos(pl.angle) * 4, pl.y + Math.sin(pl.angle) * 4 + bob * 0.3, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#2b2b33';
      ctx.beginPath();
      ctx.arc(pl.x + Math.cos(pl.angle) * 4, pl.y + Math.sin(pl.angle) * 4 + bob * 0.3 - 2, 6, Math.PI, 0);
      ctx.fill();
      ctx.strokeStyle = '#7ae8a0';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(pl.x, pl.y, 16, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Bullets + particles.
    for (const b of state.bullets) {
      ctx.fillStyle = '#ffd76a';
      ctx.beginPath();
      ctx.arc(b.x, b.y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const pt of state.particles) {
      ctx.globalAlpha = Math.max(0, pt.life / pt.max);
      ctx.fillStyle = pt.color;
      ctx.fillRect(pt.x - pt.size / 2, pt.y - pt.size / 2, pt.size, pt.size);
    }
    ctx.globalAlpha = 1;

    // Night overlay + headlight cone.
    const hour = state.clockMinutes / 60;
    const dark = hour < 6 || hour >= 19 ? 0.55 : hour < 7 || hour >= 18 ? 0.28 : 0;
    if (dark > 0) {
      ctx.fillStyle = `rgba(8,12,34,${dark})`;
      ctx.fillRect(cam.x - 40, cam.y - 40, VIEW_W + 80, VIEW_H + 80);
      if (state.player.inCar) {
        const car = state.player.inCar;
        const grad = ctx.createRadialGradient(car.x, car.y, 10, car.x, car.y, 260);
        grad.addColorStop(0, 'rgba(255,240,180,0.25)');
        grad.addColorStop(1, 'rgba(255,240,180,0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(car.x + Math.cos(car.angle) * 120, car.y + Math.sin(car.angle) * 120, 260, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
    return { ox, oy };
  }

  function currentStage(state) {
    const m = MISSIONS[state.missionIndex];
    if (!m || state.allDone) return null;
    return m.stages[state.stageIndex] || null;
  }

  function drawMinimap(state) {
    const sx = MINIMAP.w / WORLD_W;
    const sy = MINIMAP.h / WORLD_H;
    ctx.fillStyle = 'rgba(16,20,28,0.85)';
    ctx.fillRect(MINIMAP.x - 4, MINIMAP.y - 4, MINIMAP.w + 8, MINIMAP.h + 8);
    ctx.strokeStyle = '#e8c33a';
    ctx.lineWidth = 1;
    ctx.strokeRect(MINIMAP.x - 4, MINIMAP.y - 4, MINIMAP.w + 8, MINIMAP.h + 8);
    ctx.fillStyle = '#3a4a3a';
    ctx.fillRect(MINIMAP.x, MINIMAP.y, MINIMAP.w, MINIMAP.h);
    ctx.fillStyle = '#2f6a8a';
    ctx.fillRect(MINIMAP.x, MINIMAP.y, 140 * sx, MINIMAP.h);
    ctx.strokeStyle = '#8a8f9a';
    ctx.lineWidth = 1;
    for (const x of ROADS_X) {
      ctx.beginPath();
      ctx.moveTo(MINIMAP.x + x * sx, MINIMAP.y);
      ctx.lineTo(MINIMAP.x + x * sx, MINIMAP.y + MINIMAP.h);
      ctx.stroke();
    }
    for (const y of ROADS_Y) {
      ctx.beginPath();
      ctx.moveTo(MINIMAP.x, MINIMAP.y + y * sy);
      ctx.lineTo(MINIMAP.x + MINIMAP.w, MINIMAP.y + y * sy);
      ctx.stroke();
    }
    const stage = currentStage(state);
    if (stage && stage.at) {
      ctx.fillStyle = '#e8c33a';
      ctx.beginPath();
      ctx.arc(MINIMAP.x + stage.at.x * sx, MINIMAP.y + stage.at.y * sy, 5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#3d7dd9';
    for (const c of state.cops) {
      ctx.beginPath();
      ctx.arc(MINIMAP.x + c.x * sx, MINIMAP.y + c.y * sy, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#7ae8a0';
    ctx.beginPath();
    ctx.arc(MINIMAP.x + state.player.x * sx, MINIMAP.y + state.player.y * sy, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#7ae8a0';
    ctx.beginPath();
    ctx.arc(MINIMAP.x + state.player.x * sx, MINIMAP.y + state.player.y * sy, 7, 0, Math.PI * 2);
    ctx.stroke();
    text('SOLARA BAY', MINIMAP.x, MINIMAP.y + MINIMAP.h + 18, 11, '#e8e8e8', 'left');
  }

  function drawHud(state, screen, radioName) {
    const p = state.player;
    ctx.fillStyle = 'rgba(16,20,28,0.8)';
    ctx.fillRect(12, 12, 300, 96);
    // Health bar.
    ctx.fillStyle = '#3a3f4a';
    ctx.fillRect(24, 26, 180, 16);
    ctx.fillStyle = p.hp > 50 ? '#7ae8a0' : p.hp > 25 ? '#e8c33a' : '#e84f3d';
    ctx.fillRect(24, 26, 180 * Math.max(0, p.hp / 100), 16);
    text(`HP ${Math.ceil(p.hp)}`, 212, 39, 14, '#e8e8e8', 'left');
    text(`$${p.money}`, 24, 66, 22, '#7ae8a0', 'left', 'bold');
    text(`AMMO ${p.ammo}`, 150, 66, 16, '#e8c33a', 'left');
    text(`${fmtClock(state.clockMinutes)}  ${districtAt(p.x, p.y)}`, 24, 92, 14, '#c9ced6', 'left');
    // Wanted stars.
    for (let i = 0; i < 5; i += 1) {
      text('★', 330 + i * 30, 40, 28, i < state.wanted ? '#e8c33a' : 'rgba(232,232,232,0.25)', 'left');
    }
    if (state.wanted > 0) text('WANTED', 330, 66, 14, '#e84f3d', 'left', 'bold');
    if (p.inCar) text(`CAR HP ${Math.ceil(p.inCar.hp)}`, 330, 92, 14, '#e8e8e8', 'left');
    drawMinimap(state);
    // Objective banner.
    const stage = currentStage(state);
    if (stage) {
      const m = MISSIONS[state.missionIndex];
      ctx.fillStyle = 'rgba(16,20,28,0.8)';
      ctx.fillRect(12, VIEW_H - 64, 560, 52);
      ctx.fillStyle = '#e8c33a';
      ctx.fillRect(12, VIEW_H - 64, 6, 52);
      text(`MISSION ${state.missionIndex + 1}/6 — ${m.title}`, 30, VIEW_H - 42, 15, '#e8c33a', 'left', 'bold');
      let label = stage.label;
      if (stage.kind === 'tail') label += `  (${Math.max(0, stage.seconds - state.tailProgress).toFixed(1)}s)`;
      if (stage.kind === 'evade') label += `  (${Math.max(0, stage.seconds - state.evadeProgress).toFixed(1)}s)`;
      text(label, 30, VIEW_H - 22, 14, '#e8e8e8', 'left');
    } else if (state.allDone) {
      text('ALL MISSIONS COMPLETE — Solara Bay is yours!', 24, VIEW_H - 30, 16, '#7ae8a0', 'left', 'bold');
    }
    if (state.missionMsgTimer > 0) {
      text(state.missionMsg, VIEW_W / 2, 130, 17, '#ffd76a', 'center', 'bold');
    }
    if (state.passenger) text('PASSENGER ABOARD — drive smooth!', VIEW_W / 2, 156, 15, '#7ab5e8', 'center');
    // Controls + radio, bottom right.
    text(radioName, VIEW_W - 16, VIEW_H - 44, 12, '#c9ced6', 'right');
    text('WASD move/drive · E enter car · F punch · Click shoot · P pause · R radio · M mute', VIEW_W - 16, VIEW_H - 24, 12, '#8b93a3', 'right');
    // Dialog box.
    if (state.dialog) {
      const line = state.dialog[state.dialogIndex];
      ctx.fillStyle = 'rgba(10,12,18,0.92)';
      ctx.fillRect(140, VIEW_H - 190, VIEW_W - 280, 92);
      ctx.strokeStyle = '#e8c33a';
      ctx.lineWidth = 2;
      ctx.strokeRect(140, VIEW_H - 190, VIEW_W - 280, 92);
      text(line, VIEW_W / 2, VIEW_H - 148, 17, '#eef1f5', 'center');
      text('SPACE / ENTER — continue', VIEW_W / 2, VIEW_H - 118, 13, '#8b93a3', 'center');
    }
  }

  function drawPanel(title, lines, prompt, accent) {
    const w = 680;
    const h = 150 + lines.length * 30;
    const x = (VIEW_W - w) / 2;
    const y = (VIEW_H - h) / 2;
    ctx.fillStyle = 'rgba(10,12,18,0.94)';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = accent || '#e8c33a';
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, w, h);
    text(title, VIEW_W / 2, y + 62, 44, accent || '#e8c33a', 'center', 'bold');
    for (let i = 0; i < lines.length; i += 1) {
      text(lines[i], VIEW_W / 2, y + 108 + i * 30, 18, '#e8e8e8', 'center');
    }
    text(prompt, VIEW_W / 2, y + h - 28, 16, '#8b93a3', 'center');
  }

  function draw(state, screen, extra) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#10141c';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);
    const time = (extra && extra.time) || 0;
    if (screen === SCREEN_TITLE) {
      // Living backdrop: the city with traffic behind the title.
      drawWorld(state, time);
      ctx.fillStyle = 'rgba(8,10,16,0.55)';
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      text('SOLARA BAY', VIEW_W / 2, 190, 84, '#e8c33a', 'center', 'bold');
      text('An open-world crime story — six jobs, one city, no way back but through.', VIEW_W / 2, 232, 19, '#eef1f5', 'center');
      for (let i = 0; i < INTRO_LINES.length; i += 1) {
        text(INTRO_LINES[i], VIEW_W / 2, 300 + i * 26, 15, '#c9ced6', 'center');
      }
      const hasSave = extra && extra.hasSave;
      text(hasSave ? 'ENTER — Continue (save found)    N — New Game' : 'ENTER — New Game', VIEW_W / 2, 430, 20, '#7ae8a0', 'center', 'bold');
      text('WASD / arrows — move & drive · E — steal / enter car · F — punch · Mouse — aim & shoot', VIEW_W / 2, 470, 15, '#8b93a3', 'center');
      text('Original fiction. No real city, no real people, no borrowed names.', VIEW_W / 2, 500, 13, '#8b93a3', 'center');
      return;
    }
    drawWorld(state, time);
    if (screen === SCREEN_PLAY) {
      drawHud(state, screen, (extra && extra.radioName) || '');
      return;
    }
    drawHud(state, screen, (extra && extra.radioName) || '');
    if (screen === SCREEN_PAUSED) {
      ctx.fillStyle = 'rgba(8,10,16,0.5)';
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      drawPanel('PAUSED', ['The city waits. The cops do not — well, right now they do.', `Progress: mission ${Math.min(6, state.missionIndex + 1)}/6 · $${state.player.money}`], 'P / ESC — resume · S — save · T — title screen', '#e8e8e8');
    } else if (screen === SCREEN_BUSTED) {
      drawPanel('BUSTED', ['The Bay PD caught Dana Vega.', `You lose $100 bail. Mission progress is kept.`], 'ENTER — back on the streets', '#3d7dd9');
    } else if (screen === SCREEN_WASTED) {
      drawPanel('WASTED', ['Dana Vega went down in Solara Bay.', 'Bay General patched you up. You lose $100.'], 'ENTER — get back up', '#e84f3d');
    } else if (screen === SCREEN_DONE) {
      drawPanel('SOLARA BAY — COMPLETE', ['Six jobs. Done. The bay is yours, Dana Vega.', `Final cash: $${state.player.money} · Cars stolen: ${state.stats.stolen} · Shots fired: ${state.stats.shots}`], 'ENTER — keep driving the city (free roam)', '#7ae8a0');
    }
  }

  resize();
  window.addEventListener('resize', resize);
  return {
    draw,
    cam: () => ({ x: cam.x, y: cam.y }),
    view: () => view,
    // Snap the camera so a staged screenshot scene is framed at once
    // instead of lerping toward the player over many frames.
    snapTo(x, y) {
      cam.x = Math.max(0, Math.min(WORLD_W - VIEW_W, x));
      cam.y = Math.max(0, Math.min(WORLD_H - VIEW_H, y));
    },
  };
}
