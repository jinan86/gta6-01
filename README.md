# SOLARA BAY

[![Play SOLARA BAY](https://img.shields.io/badge/Play-SOLARA%20BAY-ff6b35?style=for-the-badge)](https://make.fun/bounty/gta6-01)
[![Built with make.fun](https://img.shields.io/badge/Built%20with-make.fun-8a5cf6?style=for-the-badge)](https://make.fun/r/95rs49se)
[![By jinan86](https://img.shields.io/badge/By-jinan86-00c2a8?style=for-the-badge)](https://github.com/jinan86/gta6-01)

An original open-world crime game for the [Make GTA 6 bounty](https://make.fun/bounty/gta6-01) on [make.fun](https://make.fun/r/95rs49se).

## The game

**Solara Bay** is a sun-soaked fictional port city where the tide brings in everything: fish, freight, and trouble. You are **Dana Vega**, driver-for-hire. Dispatcher **Mara Solis** and fixer **Rook Halden** have six jobs for you — and six jobs stand between Dana and a clean slate.

- **An open city to explore** on foot and by car: four districts (Downtown, Harbor, Northside, Industrial), a road grid with traffic and pedestrians, parks, a marina, a hospital, a police HQ, a bank and a spray shop.
- **Cars to steal and drive**: walk up to any car and press **E**. If it has a driver, they bail out — and the law notices. Drive with **WASD / arrows**, with damage, smoke, and screen shake when you crash.
- **A wanted level (1–5 stars) with police who respond**: Bay PD patrol cars and foot cops chase you. Get caught and you are **BUSTED**; go down and you are **WASTED**. Break line of sight to cool off, or pay $50 for a fresh coat at the Spray Shop.
- **Missions and a story**: six sequential jobs with dialog — a first fare, a three-stop parcel run, tailing a silver van, a midnight pickup at Pier 9, a warehouse job against three guards, and the big score at Solara Trust Bank. Each pays cash; finishing all six completes the story.
- **Combat**: punch with **F**, aim and shoot the pistol with the **mouse** (limited ammo; ammo boxes and medkits are scattered around the city).
- **HUD with minimap**: health, cash, ammo, wanted stars, clock, district name, mission objective, and a live minimap showing you, the mission marker, and the police.
- **Start screen and saving**: title screen with New Game / Continue, progress saved to localStorage (mission, cash, position), pause menu with **P / Esc**, and a day/night cycle with three synth radio stations (**R** to change, **M** to mute).

## How to run

```bash
node serve.ts
```

Then open http://localhost:8080 in a desktop browser. No build step, no network requests: every script is a file under `game/`, all art is drawn procedurally on canvas, and all sound and music is synthesized with WebAudio.

## Controls

| Input | Action |
|---|---|
| WASD / arrows | Walk / drive |
| E | Enter or steal a car (exit it too) |
| F | Punch |
| Mouse click | Shoot the pistol |
| Enter / Space | Start, continue dialog, retry after Busted/Wasted |
| P / Esc | Pause |
| S (while paused) | Save |
| R | Change radio station |
| M | Mute |

## Tech

Pure ES modules, no libraries, no network requests. The source is split by job: `game/src/config.js` (city layout, districts, mission scripts), `game/src/world.js` (rules: traffic, police, wanted, missions, combat), `game/src/render.js` (canvas art, HUD, minimap, menus), `game/src/audio.js` (synth engine, siren, radio), `game/src/input.js`, `game/src/shots.js` (deterministic screenshot scenes), `game/src/main.js` (boot, loop, screens, saves).

Everything in the game — the city, the characters, the vehicles, the story, the art, the sounds and the music — is original. Nothing is taken from any commercial game.

Built by [@jinan86](https://github.com/jinan86) for the make.fun GTA 6 bounty. Play it and more at [make.fun](https://make.fun/r/95rs49se).
