// EMBERLINE — palette. One dusk-industrial palette, used by every module so the
// map, the characters and the HUD read as one place: warm amber key light against
// cool blue-grey steel, with ember orange for the attacking team and ice teal for
// the defenders. Every colour the game shows is one of these.
export const PALETTE = {
  canvas: '#1b1e26', // dusk sky / fog
  ground: '#2b2e36', // concrete yard
  groundDark: '#23262d',
  steel: '#3a3f4a', // walls and containers, cool
  steelDark: '#2e323c',
  rust: '#7a4a2e', // rusted containers and beams
  amber: '#f0a830', // site markings, accents, Ember team
  ember: '#ff7a1a', // Ember team colour
  emberDark: '#b34d00',
  teal: '#35c8b8', // Vanta team colour
  tealDark: '#0f6f66',
  ink: '#ece7db', // HUD text
  muted: '#9aa1ad', // secondary HUD text
  danger: '#e5484d', // damage, enemy tracers
  good: '#7dc383', // health, win
  crate: '#6b5a3e', // wooden crates
  barrel: '#4a5a3a', // olive barrels
  hazard: '#c9a227', // hazard stripes
  white: '#ffffff',
};

export const TEAM = {
  ember: { name: 'EMBER', color: PALETTE.ember, dark: PALETTE.emberDark },
  vanta: { name: 'VANTA', color: PALETTE.teal, dark: PALETTE.tealDark },
};
