/**
 * The game's English text, which every other language copies key for key (see `Dictionary`).
 * Entries that take numbers or names are functions, so each language can put them in its own
 * order and plural forms.
 */
export const en = {
  title: { game: 'Tanki', mode: 'King of the hill' },
  menu: {
    paused: 'Paused',
    open: 'Esc · menu',
    match: 'Match',
    resume: 'Resume',
    resumeHint: 'back to the fight',
    restart: 'Restart',
    restartHint: 'a new match',
    class: 'Class',
    watch: 'Watch bots',
    watchHint: 'a bot drives',
    takeTank: 'Take the tank',
    takeTankHint: 'play again',
    view: 'View',
    aim: 'Aim',
    thoughts: 'Bot thoughts',
    off: 'Off',
    on: 'On',
    language: 'Language',
    pace: 'Pace',
    reset: 'Reset',
    derived: (drive: number, shell: number, from: string, to: string) =>
      `Medium tank ${drive} px/s · its shell ${shell} px/s · bots react in ${from}–${to} s`,
    keys: 'Keys'
  },
  knob: {
    speed: 'Game speed',
    tankSpeed: 'Tank speed',
    shellSpeed: 'Shell speed',
    damage: 'Damage',
    botReaction: 'Bot reaction',
    botSight: 'Bot sight',
    zoom: 'Zoom',
    lead: 'Camera lead'
  },
  keys: {
    drive: ['WASD', 'drive'],
    aim: ['Mouse', 'aim; the view looks ahead'],
    fire: ['LMB · Space', 'fire while held'],
    charge: ['Sniper', 'hold to charge, let go'],
    turn: ['RMB · Shift', 'turn on the spot'],
    view: ['Q · E', 'turn the view'],
    zoom: ['Wheel · + −', 'zoom'],
    class: ['1–5 · C', 'class'],
    follow: ['V, then 1–8 · 0', 'follow a tank · map']
  },
  look: { dots: 'Dots', line: 'Line', dash: 'Dashes' },
  lookNotice: (look: string) => `Aim: ${look} (X)`,
  tankClass: {
    scout: 'Scout',
    soldier: 'Soldier',
    heavy: 'Heavy',
    demoman: 'Demoman',
    sniper: 'Sniper'
  },
  short: { scout: 'Sc', soldier: 'So', heavy: 'Hv', demoman: 'De', sniper: 'Sn' },
  classRole: {
    scout: 'Fast flanker; a point-blank scattergun, deadliest from behind; captures 2x',
    soldier: 'Rockets with splash and shrapnel; rocket-jump by firing at your feet',
    heavy: 'Slow, plated; a gatling stream that drills armor up close; holds the point',
    demoman: 'Lobs bouncing grenades over cover; big splash; breaks walls',
    sniper: 'Casemate gun: hold to charge; the scope shows cores; a rail through one kills'
  },
  classMenu: {
    title: 'Choose a class',
    speed: 'Speed',
    armor: 'Armor',
    reach: 'Reach',
    current: 'now',
    next: 'next respawn',
    hint: '1–5 or click to pick · in your base the change is instant, elsewhere at your next respawn · C or Esc closes'
  },
  botRole: { assault: 'assault', flank: 'flank', support: 'support', anchor: 'anchor', sniper: 'sniper' },
  seat: {
    you: 'You',
    youBot: 'You (bot)',
    red: (seat: number) => `Red ${seat}`,
    blue: (seat: number) => `Blue ${seat}`
  },
  hud: {
    kills: (count: number) => `${count} ${count === 1 ? 'kill' : 'kills'}`,
    locked: 'Locked',
    overtime: 'Overtime',
    contested: 'Contested',
    respawn: (seconds: number, tankClass: string) => `Respawning in ${seconds} as ${tankClass}`,
    changeClass: 'C or 1–5: change class',
    coreOpen: 'Core exposed — get to cover or your base',
    mending: 'Mending armor',
    nextRespawn: (tankClass: string) => `Next respawn: ${tankClass}`,
    gauge: { idle: 'Hold', charging: 'Charge', full: 'Full' }
  },
  plan: { push: 'push', hold: 'hold', regroup: 'regroup', gather: 'gathering', go: 'going in' },
  result: {
    wins: { red: 'Red team wins', blue: 'Blue team wins' },
    team: { red: 'Red', blue: 'Blue' },
    held: (seconds: number) => `held ${seconds} s`,
    kills: 'K',
    deaths: 'D',
    again: 'Play again'
  }
};

/** The shape every language's text has. */
export type Dictionary = typeof en;
