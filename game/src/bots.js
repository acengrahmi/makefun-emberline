// Bots: nine AI fighters that fill both teams around the player. Each bot runs
// the same movement controller and the same weapons as the player, and decides
// what to do from a small state machine: follow a waypoint route to its site,
// hold an angle, fight what it can see, rotate to gunfire it hears, plant the
// charge or defuse it. Roles differ per bot: rushers push, holders sit on
// angles, the lurker works mid, rotators answer noise.
import * as THREE from 'three';
import { createPlayer } from './player.js';
import { WEAPONS, createWeapon } from './weapons.js';
import { createSoldier, updateSoldier, layDownSoldier } from './characters.js';

const BOT_NAMES = {
  ember: ['ASH', 'COAL', 'SPARK', 'FLINT'],
  vanta: ['FROST', 'GLACIER', 'MIST', 'HAIL', 'SLEET'],
};

const ROLE_LOADOUT = {
  rusher: 'rifle',
  holder: 'rifle',
  lurker: 'smg',
  rotator: 'rifle',
  sniper: 'sniper',
};

function pickSite(rng) {
  return rng() < 0.5 ? 'A' : 'B';
}

export function createBot(G, team, role, index, spawnPos) {
  const body = createPlayer(G.world.colliders, { x: spawnPos.x, y: 0, z: spawnPos.z, yaw: team === 'ember' ? 0 : Math.PI });
  const soldier = createSoldier(team);
  G.scene.add(soldier.group);
  const name = BOT_NAMES[team][index % BOT_NAMES[team].length];
  const bot = {
    isBot: true,
    name,
    team,
    role,
    body,
    soldier,
    weapon: createWeapon(ROLE_LOADOUT[role] ?? 'rifle'),
    weaponId: ROLE_LOADOUT[role] ?? 'rifle',
    hp: 100,
    armor: 50,
    alive: true,
    money: 800,
    kills: 0,
    deaths: 0,
    sitePref: pickSite(G.rng),
    state: 'move',
    path: [],
    pathIndex: 0,
    holdNode: null,
    holdYaw: 0,
    target: null,
    lastSeenPos: new THREE.Vector3(),
    lastSeenTime: -99,
    reactionEnd: 0,
    aimError: 0.05,
    burstLeft: 0,
    burstPause: 0,
    strafeDir: 1,
    strafeTimer: 0,
    stuckTimer: 0,
    lastPos: new THREE.Vector3(spawnPos.x, 0, spawnPos.z),
    walkPhase: 0,
    flashT: 0,
    plantProgress: 0,
    defuseProgress: 0,
    hasSpike: false,
    hearPos: null,
    hearTime: -99,
    thinkTimer: G.rng() * 0.3,
  };
  // holder's perch: a node near its site, facing the likely approach
  if (role === 'holder') {
    bot.holdNode = bot.sitePref === 'A' ? 'aHold' : 'bHold';
    bot.holdYaw = bot.sitePref === 'A' ? Math.PI * 0.75 : Math.PI * 0.25;
  }
  if (role === 'sniper') {
    bot.holdNode = bot.sitePref === 'A' ? 'midN' : 'midN';
    bot.holdYaw = Math.PI;
  }
  return bot;
}

/** Choose a destination node id for a bot that has no objective right now. */
function objectiveNode(G, bot) {
  const world = G.world;
  const spike = G.spike;
  if (bot.team === 'ember') {
    if (spike.state === 'planted') return spike.site === 'A' ? 'aSite' : 'bSite';
    if (bot.hasSpike) return bot.sitePref === 'A' ? 'aSite' : 'bSite';
    if (spike.state === 'dropped') return world.nearestNode(spike.pos);
    if (bot.role === 'lurker') return bot.sitePref === 'A' ? 'aMid' : 'bMid';
    return bot.sitePref === 'A' ? 'aSite' : 'bSite';
  }
  // vanta (defenders)
  if (spike.state === 'planted') return spike.site === 'A' ? 'aSite' : 'bSite';
  if (bot.role === 'holder' || bot.role === 'sniper') return bot.holdNode;
  if (bot.hearTime > G.time - 6 && bot.hearPos) {
    // rotate toward the noise, on the side it came from
    const near = world.nearestNode(bot.hearPos);
    return near;
  }
  return bot.sitePref === 'A' ? 'defA' : 'defB';
}

function setPath(G, bot, destNode) {
  const from = G.world.nearestNode(bot.body.state.position);
  bot.path = G.world.findPath(from, destNode);
  bot.pathIndex = 0;
}

const _eye = new THREE.Vector3();
const _targetEye = new THREE.Vector3();
const _toTarget = new THREE.Vector3();

/** The nearest enemy this bot can actually see right now, or null. */
function visibleEnemy(G, bot) {
  const pos = bot.body.state.position;
  _eye.set(pos.x, pos.y + bot.body.state.eye, pos.z);
  let best = null;
  let bestD = 30;
  for (const f of G.fighters) {
    if (!f.alive || f.team === bot.team) continue;
    const fp = f.body.state.position;
    const dx = fp.x - pos.x;
    const dz = fp.z - pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist > bestD) continue;
    // must be roughly in front, unless it was just seen (peripheral memory)
    const angTo = Math.atan2(-dx, -dz);
    let diff = angTo - bot.body.state.yaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const seenRecently = f === bot.target && G.time - bot.lastSeenTime < 1.2;
    if (Math.abs(diff) > 1.15 && !seenRecently) continue;
    _targetEye.set(fp.x, fp.y + f.body.state.eye * 0.85, fp.z);
    if (!G.world.lineOfSight(_eye, _targetEye, 32)) continue;
    best = f;
    bestD = dist;
  }
  return best;
}

function turnToward(bot, targetYaw, dt, rate = 4.2) {
  let diff = targetYaw - bot.body.state.yaw;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  const step = Math.max(-rate * dt, Math.min(rate * dt, diff));
  bot.body.state.yaw += step;
  return diff;
}

function moveAlongPath(G, bot, dt, keys) {
  const pos = bot.body.state.position;
  if (bot.pathIndex >= bot.path.length) return false;
  const node = G.world.byId.get(bot.path[bot.pathIndex]);
  const dx = node.pos.x - pos.x;
  const dz = node.pos.z - pos.z;
  const dist = Math.hypot(dx, dz);
  if (dist < 0.9) {
    bot.pathIndex += 1;
    return bot.pathIndex < bot.path.length;
  }
  const targetYaw = Math.atan2(-dx, -dz);
  turnToward(bot, targetYaw, dt, 5);
  keys.add('KeyW');
  // stuck detection: no progress for a while means repath to the destination
  if (pos.distanceToSquared(bot.lastPos) < 0.0004) {
    bot.stuckTimer += dt;
    if (bot.stuckTimer > 1.4) {
      bot.stuckTimer = 0;
      bot.lastPos.copy(pos);
      const dest = bot.path[bot.path.length - 1];
      setPath(G, bot, dest);
      return true;
    }
  } else {
    bot.stuckTimer = 0;
    bot.lastPos.copy(pos);
  }
  return true;
}

/** Aim the soldier's mesh at its body's position and pose, from the sim. */
export function syncBotVisual(G, bot, dt) {
  const body = bot.body.state;
  const speed = bot.body.groundSpeed();
  bot.walkPhase += dt * speed * 1.9;
  bot.soldier.group.position.set(body.position.x, body.position.y, body.position.z);
  updateSoldier(bot.soldier, {
    speed,
    yaw: body.yaw,
    pitch: body.pitch,
    crouching: body.crouching,
    firing: false,
    walkPhase: bot.walkPhase,
    baseY: body.position.y,
  });
  bot.soldier.group.updateMatrixWorld(true);
}

export function updateBot(G, bot, dt) {
  if (!bot.alive) return;
  const body = bot.body.state;
  const keys = new Set();
  bot.thinkTimer -= dt;
  bot.weapon.step(G.time, dt);
  if (bot.weapon.mag <= 0 && !bot.weapon.reloading) bot.weapon.startReload(G.time);

  // flashed: blind, cannot fire, stands still
  if (bot.flashT > 0) {
    bot.flashT -= dt;
    bot.body.step(dt, keys);
    syncBotVisual(G, bot, dt);
    return;
  }

  // ---- perception
  const enemy = visibleEnemy(G, bot);
  if (enemy) {
    if (bot.target !== enemy) {
      bot.target = enemy;
      bot.reactionEnd = G.time + 0.35 + G.rng() * 0.45;
      bot.aimError = 0.045 + G.rng() * 0.02;
      bot.burstLeft = 0;
    }
    bot.lastSeenPos.copy(enemy.body.state.position);
    bot.lastSeenTime = G.time;
    bot.aimError = Math.max(0.008, bot.aimError - dt * 0.03);
  } else if (bot.target && G.time - bot.lastSeenTime > 1.2) {
    bot.target = null;
  }

  // ---- combat
  if (bot.target && bot.target.alive) {
    bot.state = 'combat';
    const tp = bot.target.body.state.position;
    _toTarget.set(tp.x - body.position.x, 0, tp.z - body.position.z);
    const dist = _toTarget.length();
    const targetYaw = Math.atan2(-_toTarget.x, -_toTarget.z);
    turnToward(bot, targetYaw, dt, 6);
    // aim the pitch at the chest/head
    const dy = tp.y + bot.target.body.state.eye * 0.9 - (body.position.y + body.eye);
    const targetPitch = Math.atan2(dy, Math.max(1, dist));
    body.pitch += (targetPitch - body.pitch) * Math.min(1, dt * 8);
    // strafe and keep a fighting distance
    bot.strafeTimer -= dt;
    if (bot.strafeTimer <= 0) {
      bot.strafeTimer = 0.6 + G.rng() * 0.7;
      bot.strafeDir = G.rng() < 0.5 ? -1 : 1;
    }
    if (dist > 20) keys.add('KeyW');
    else if (dist < 6) keys.add('KeyS');
    keys.add(bot.strafeDir > 0 ? 'KeyD' : 'KeyA');
    if (bot.hp < 35 && G.rng() < 0.3) keys.add('ControlLeft');
    // fire in bursts once the reaction time has passed
    if (G.time >= bot.reactionEnd && bot.weapon.ready(G.time)) {
      if (bot.burstLeft <= 0) {
        if (bot.burstPause <= 0) {
          bot.burstLeft = 3 + Math.floor(G.rng() * 3);
          bot.burstPause = 0.5 + G.rng() * 0.5;
        } else {
          bot.burstPause -= dt;
        }
      }
      if (bot.burstLeft > 0) {
        G.combat.fire(G, bot, bot.aimError);
        bot.burstLeft -= 1;
      }
    }
    bot.body.step(dt, keys);
    syncBotVisual(G, bot, dt);
    return;
  }

  // ---- objective behaviour
  bot.state = 'move';
  const spike = G.spike;
  if (bot.team === 'ember' && bot.hasSpike && spike.state === 'carried') {
    const site = G.world.sites[bot.sitePref];
    const d = Math.hypot(site.center.x - body.position.x, site.center.z - body.position.z);
    if (d < site.radius - 0.5) {
      bot.state = 'plant';
      bot.plantProgress += dt;
      if (bot.plantProgress >= 3.5) {
        bot.plantProgress = 0;
        G.match.plantSpike(G, bot, bot.sitePref);
      }
      bot.body.step(dt, keys);
      syncBotVisual(G, bot, dt);
      return;
    }
  }
  if (bot.team === 'vanta' && spike.state === 'planted') {
    const d = Math.hypot(spike.pos.x - body.position.x, spike.pos.z - body.position.z);
    if (d < 2.6) {
      bot.state = 'defuse';
      bot.defuseProgress += dt;
      if (Math.floor(bot.defuseProgress * 2) !== Math.floor((bot.defuseProgress - dt) * 2)) G.audio.defuseBeep();
      if (bot.defuseProgress >= 5) {
        bot.defuseProgress = 0;
        G.match.defuseSpike(G, bot);
      }
      bot.body.step(dt, keys);
      syncBotVisual(G, bot, dt);
      return;
    }
  }
  // holders sit on their angle once they arrive
  if ((bot.role === 'holder' || bot.role === 'sniper') && bot.holdNode && spike.state !== 'planted') {
    const node = G.world.byId.get(bot.holdNode);
    const d = Math.hypot(node.pos.x - body.position.x, node.pos.z - body.position.z);
    if (d < 1.2) {
      bot.state = 'hold';
      turnToward(bot, bot.holdYaw + Math.sin(G.time * 0.4 + bot.walkPhase) * 0.25, dt, 2);
      if (bot.role === 'sniper' && G.rng() < 0.002) keys.add('ControlLeft');
      bot.body.step(dt, keys);
      syncBotVisual(G, bot, dt);
      return;
    }
  }

  // repath every couple of seconds or when the path runs out
  if (bot.thinkTimer <= 0 || bot.pathIndex >= bot.path.length) {
    bot.thinkTimer = 1.5 + G.rng();
    const dest = objectiveNode(G, bot);
    setPath(G, bot, dest);
  }
  moveAlongPath(G, bot, dt, keys);
  bot.body.step(dt, keys);
  syncBotVisual(G, bot, dt);
}

/** Kill a bot: fall over, drop the spike if carried, remove from the fight. */
export function killBot(G, bot) {
  bot.alive = false;
  bot.deaths += 1;
  layDownSoldier(bot.soldier);
  if (bot.hasSpike) {
    bot.hasSpike = false;
    G.spike.state = 'dropped';
    G.spike.pos.copy(bot.body.state.position);
    G.spike.carrier = null;
  }
}
