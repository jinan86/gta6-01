// Deterministic screenshot scenes behind ?shot=title|play|drive|wanted|mission.
// Each scene plays the real rules forward from a fresh world for a fixed
// number of steps, steered by a scripted autopilot, so the frame is what a
// short game really looks like and the same seed always gives the same frame.
import { STEP, LANDMARKS } from './config.js';
import { EVENT_BUSTED, EVENT_WASTED } from './world.js';
import { SCREEN_TITLE, SCREEN_PLAY } from './render.js';

const SAMPLE = STEP;

// Drive the player toward a point: on foot walk, in a car steer + throttle.
function driveInput(world, tx, ty) {
  const p = world.state.player;
  const dx = tx - p.x;
  const dy = ty - p.y;
  const want = Math.atan2(dy, dx);
  if (p.inCar) {
    const car = p.inCar;
    const diff = want - car.angle;
    const turn = ((diff + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    const d = Math.hypot(dx, dy);
    // Brake into sharp turns instead of ramming the corner building.
    // (The car can turn while pulling away, so throttle stays on for
    // all but the sharpest turns.)
    const braking = Math.abs(turn) > 0.7 && d < 260;
    return { up: Math.abs(turn) < 2.6 && !braking, down: braking, left: turn < -0.15, right: turn > 0.15, enter: false, punch: false, shoot: null, dialogAdvance: false };
  }
  return {
    up: dy < -20, down: dy > 20, left: dx < -20, right: dx > 20,
    enter: false, punch: false, shoot: null, dialogAdvance: false,
  };
}

function runSteps(world, n, inputFn) {
  for (let i = 0; i < n; i += 1) {
    const input = inputFn ? inputFn(i) : { up: false, down: false, left: false, right: false, enter: false, punch: false, shoot: null, dialogAdvance: false };
    const events = world.step(STEP, input, {});
    if (events & (EVENT_BUSTED | EVENT_WASTED)) break;
  }
}

// Steal the nearest car, then drive it along a route of waypoints.
function stealAndDrive(world, waypoints, seconds) {
  const p = world.state.player;
  const car = world.state.cars.find((c) => !c.driver || c.driver === null);
  if (car) {
    p.x = car.x - 40;
    p.y = car.y;
    world.step(STEP, { up: false, down: false, left: false, right: false, enter: true, punch: false, shoot: null, dialogAdvance: false }, {});
  }
  let wp = 0;
  runSteps(world, Math.floor(seconds / STEP), () => {
    if (!world.state.player.inCar) return driveInput(world, waypoints[wp].x, waypoints[wp].y);
    const target = waypoints[wp];
    if (Math.hypot(target.x - p.x, target.y - p.y) < 90) wp = Math.min(wp + 1, waypoints.length - 1);
    return driveInput(world, waypoints[wp].x, waypoints[wp].y);
  });
}

export function stageShot(name, world) {
  world.reset();
  // Skip the opening dialog so the frame shows the city, not a text box.
  world.state.dialog = null;
  if (name === 'title') {
    runSteps(world, Math.floor(4 / STEP), () => ({ up: false, down: false, left: false, right: false, enter: false, punch: false, shoot: null, dialogAdvance: false }));
    return { screen: SCREEN_TITLE, hasSave: false };
  }
  if (name === 'drive') {
    stealAndDrive(world, [
      { x: 1000, y: 1000 }, { x: 1800, y: 1000 }, { x: 2200, y: 1000 }, { x: 2200, y: 600 },
    ], 12);
    return { screen: SCREEN_PLAY };
  }
  if (name === 'wanted') {
    world.addWanted(3);
    stealAndDrive(world, [
      { x: 1000, y: 1000 }, { x: 1400, y: 1000 }, { x: 1800, y: 1000 }, { x: 1800, y: 1400 },
    ], 10);
    return { screen: SCREEN_PLAY };
  }
  if (name === 'mission') {
    world.startMission(4);
    world.state.dialog = null;
    stealAndDrive(world, [
      { x: 1000, y: 1000 }, { x: 1400, y: 1000 }, { x: 1800, y: 1000 }, { x: 2200, y: 1400 }, { x: 2600, y: 1800 },
    ], 16);
    // End on foot beside the warehouse guards: the fight is the shot.
    const p = world.state.player;
    if (p.inCar) {
      const car = p.inCar;
      car.x = 2480;
      car.y = 1840;
      car.angle = Math.PI / 2;
      car.speed = 0;
      car.driver = null;
      p.inCar = null;
    }
    p.x = 2520;
    p.y = 1780;
    p.angle = Math.PI / 4;
    runSteps(world, Math.floor(1.5 / STEP), () => ({ up: false, down: false, left: false, right: false, enter: false, punch: false, shoot: null, dialogAdvance: false }));
    return { screen: SCREEN_PLAY };
  }
  // Default 'play': on foot near the hideout, then steal and drive downtown.
  stealAndDrive(world, [
    { x: 1000, y: 1000 }, { x: 1400, y: 1000 }, { x: 1400, y: 1400 },
  ], 9);
  return { screen: SCREEN_PLAY };
}
