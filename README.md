# EMBERLINE — a three.js tactical FPS

Round-based tactical FPS for make.fun's `threejs-fps-02` bounty: 5v5 in the
original dusk-industrial map "Foundry Yard" — two bomb sites, a mid lane, buy
economy, five weapons, two grenades, and nine AI bots with roles, routes and
reactions. First to 7 rounds wins; rounds end by elimination, charge
detonation/defusal, or time.

Play it: `node serve.ts`, then open http://localhost:8080 in desktop Chrome.

Built with three.js 0.187.0 (vendored under `game/vendor/three/`). `main.ts`
(Node 22) hands the game in: it copies `game/` and `screenshots/` to
`/output` and writes `/output/dossier.json`.

MIT licensed. Counter-Strike-style, never a copy: own map, art, sounds, names.
