// Boot and the one loop: input is read every frame, the world advances in
// fixed 1/60 s steps, the renderer paints what is there. Screens: title,
// play, paused, busted, wasted, done. Saves to localStorage.
//
// ?seed=N fixes the city. ?shot=title|play|drive|wanted|mission (with
// &seed=N) stages that scene instead of running the loop, paints it twice
// and sets window.__shotReady for a screenshot.
import { STEP, SAVE_KEY, VIEW_W, VIEW_H } from './config.js';
import { createRandom } from './random.js';
import { createWorld, EVENT_BUSTED, EVENT_WASTED, EVENT_MISSION_DONE, EVENT_ALL_DONE, EVENT_STEAL, EVENT_SHOT, EVENT_PICKUP, EVENT_REPAINT } from './world.js';
import { ACTION_CONFIRM, ACTION_PAUSE, ACTION_ENTER, ACTION_PUNCH, ACTION_DIALOG, ACTION_RADIO, ACTION_MUTE, createInput } from './input.js';
import { createRenderer, SCREEN_TITLE, SCREEN_PLAY, SCREEN_PAUSED, SCREEN_BUSTED, SCREEN_WASTED, SCREEN_DONE } from './render.js';
import { createAudio } from './audio.js';
import { stageShot } from './shots.js';

const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas);
const audio = createAudio();

function readSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeSave() {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(world.getSave()));
    return true;
  } catch {
    return false;
  }
}

function runShot(name) {
  const scene = stageShot(name, world);
  const p = world.state.player;
  renderer.snapTo(p.x - 640, p.y - 360);
  let painted = 0;
  function paint() {
    renderer.draw(world.state, scene.screen, { time: 4, hasSave: scene.hasSave === true, radioName: 'BAY FM 88 — Sunset Drive' });
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let save = readSave();
  let hasSave = !!save;
  let accumulator = 0;
  let last = performance.now();
  let time = 0;
  let extraKey = null;
  // One-shot input held until a world step consumes it (see stepWorld).
  let pendingActions = 0;
  let pendingShoot = null;

  window.addEventListener('keydown', (event) => {
    if (!event.repeat) extraKey = event.code;
    audio.unlock();
  });
  canvas.addEventListener('pointerdown', () => audio.unlock());

  window.__solarabay = {
    screen: () => screen,
    world,
    state: world.state,
    save: () => writeSave(),
  };

  function announce(message) {
    status.textContent = message;
  }

  function startNew() {
    world.reset();
    screen = SCREEN_PLAY;
    announce('Playing. Dana Vega, Solara Bay. Mission 1: First Fare.');
  }

  function startContinue() {
    if (save) {
      world.reset();
      world.applySave(save);
      screen = SCREEN_PLAY;
      announce('Continuing saved game.');
    } else startNew();
  }

  function respawn(place, lost) {
    const p = world.state.player;
    p.money = Math.max(0, p.money - lost);
    p.hp = 100;
    p.inCar = null;
    world.state.wanted = 0;
    world.state.cops.length = 0;
    world.state.bustedTimer = 0;
    p.x = place.x;
    p.y = place.y;
    writeSave();
    screen = SCREEN_PLAY;
  }

  function handleEvents(events) {
    if (events & EVENT_STEAL) audio.blip(220, 0.2, 'sawtooth', 0.3);
    if (events & EVENT_SHOT) audio.gunshot();
    if (events & EVENT_PICKUP) audio.chime();
    if (events & EVENT_REPAINT) audio.chime();
    if (events & EVENT_MISSION_DONE) {
      audio.chime();
      writeSave();
      announce('Mission complete.');
    }
    if (events & EVENT_ALL_DONE) screen = SCREEN_DONE;
    if (events & EVENT_BUSTED) {
      screen = SCREEN_BUSTED;
      announce('Busted by the Bay PD.');
    }
    if (events & EVENT_WASTED) {
      screen = SCREEN_WASTED;
      announce('Wasted.');
    }
  }

  function stepWorld(dt) {
    // One-shot presses are held in pendingActions until a world step runs:
    // a frame that only accumulates time must not swallow a press.
    const actions = pendingActions;
    pendingActions = 0;
    const shootScreen = pendingShoot;
    pendingShoot = null;
    let shoot = null;
    if (shootScreen && screen === SCREEN_PLAY && !world.state.dialog) {
      // Screen (CSS) pixels -> view units -> world coordinates.
      const rect = canvas.getBoundingClientRect();
      const dpr = canvas.width / Math.max(1, rect.width);
      const v = renderer.view();
      const vx = ((shootScreen.x - rect.left) * dpr - v.x) / v.scale;
      const vy = ((shootScreen.y - rect.top) * dpr - v.y) / v.scale;
      const cam = renderer.cam();
      shoot = { x: vx + cam.x, y: vy + cam.y };
    }
    const keys = input.keys;
    const dialogOpen = !!world.state.dialog;
    const stepInput = {
      up: keys.up, down: keys.down, left: keys.left, right: keys.right,
      enter: !!(actions & ACTION_ENTER) && !dialogOpen,
      punch: !!(actions & ACTION_PUNCH) && !dialogOpen,
      shoot,
      dialogAdvance: !!(actions & ACTION_DIALOG) && dialogOpen,
    };
    if (actions & ACTION_RADIO) {
      const name = audio.nextStation();
      world.state.missionMsg = `Radio: ${name}`;
      world.state.missionMsgTimer = 3;
    }
    if (actions & ACTION_MUTE) audio.setMuted(!audio.isMuted());
    const events = world.step(dt, stepInput, {});
    handleEvents(events);
    const p = world.state.player;
    audio.setEngine(p.inCar ? Math.abs(p.inCar.speed) / p.inCar.maxSpeed : 0, !!p.inCar);
    audio.setSiren(world.state.wanted > 0, time);
  }

  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    time += dt;
    // Collect one-shot input into the pending buffer; the screen branches
    // below consume it, except in PLAY where stepWorld takes it on the
    // first world step of the frame (see stepWorld).
    pendingActions |= input.takeActions();
    const shootNow = input.takeShoot();
    if (shootNow) pendingShoot = shootNow;
    const key = extraKey;
    extraKey = null;

    if (screen === SCREEN_TITLE) {
      const actions = pendingActions;
      pendingActions = 0;
      world.step(STEP, { up: false, down: false, left: false, right: false, enter: false, punch: false, shoot: null, dialogAdvance: false }, { harmless: true });
      if (actions & ACTION_CONFIRM) startContinue();
      else if (key === 'KeyN') startNew();
    } else if (screen === SCREEN_PLAY) {
      if (pendingActions & ACTION_PAUSE) {
        pendingActions = 0;
        screen = SCREEN_PAUSED;
        announce('Paused.');
      } else {
        accumulator += dt;
        while (accumulator >= STEP && screen === SCREEN_PLAY) {
          stepWorld(STEP);
          accumulator -= STEP;
        }
      }
    } else if (screen === SCREEN_PAUSED) {
      const actions = pendingActions;
      pendingActions = 0;
      if (actions & ACTION_PAUSE) {
        screen = SCREEN_PLAY;
        announce('Playing.');
      } else if (key === 'KeyS') {
        writeSave();
        world.state.missionMsg = 'Game saved.';
        world.state.missionMsgTimer = 2;
      } else if (key === 'KeyT') {
        save = readSave();
        hasSave = !!save;
        screen = SCREEN_TITLE;
      }
    } else if (screen === SCREEN_BUSTED) {
      const actions = pendingActions;
      pendingActions = 0;
      if (actions & ACTION_CONFIRM) respawn({ x: 1800, y: 1400 }, 100);
    } else if (screen === SCREEN_WASTED) {
      const actions = pendingActions;
      pendingActions = 0;
      if (actions & ACTION_CONFIRM) respawn({ x: 2600, y: 600 }, 100);
    } else if (screen === SCREEN_DONE) {
      const actions = pendingActions;
      pendingActions = 0;
      if (actions & ACTION_CONFIRM) screen = SCREEN_PLAY;
    }
    // One-shot input lives in pendingActions until the branch above or a
    // world step consumes it; later steps in the same frame get none.
    renderer.draw(world.state, screen, { time, hasSave, radioName: audio.stationName() });
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  announce('Solara Bay. Press Enter to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
