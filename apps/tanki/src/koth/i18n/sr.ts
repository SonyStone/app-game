import type { Dictionary } from './en';

/** The game's Serbian text, in Cyrillic. */
export const sr: Dictionary = {
  title: { game: 'Танки', mode: 'Краљ брда' },
  menu: {
    paused: 'Пауза',
    open: 'Esc · мени',
    match: 'Меч',
    resume: 'Настави',
    resumeHint: 'назад у борбу',
    restart: 'Испочетка',
    restartHint: 'нови меч',
    class: 'Класа',
    watch: 'Гледај',
    watchHint: 'вози бот',
    takeTank: 'Преузми тенк',
    takeTankHint: 'играј поново',
    view: 'Приказ',
    aim: 'Нишан',
    thoughts: 'Мисли ботова',
    off: 'Искљ',
    on: 'Укљ',
    language: 'Језик',
    pace: 'Темпо',
    reset: 'Врати',
    derived: (drive: number, shell: number, from: string, to: string) =>
      `Средњи тенк ${drive} px/s · његова граната ${shell} px/s · ботови реагују за ${from}–${to} s`,
    keys: 'Тастери'
  },
  knob: {
    speed: 'Брзина игре',
    tankSpeed: 'Брзина тенкова',
    shellSpeed: 'Брзина граната',
    damage: 'Штета',
    botReaction: 'Реакција ботова',
    botSight: 'Видик ботова',
    zoom: 'Зум',
    lead: 'Камера унапред'
  },
  keys: {
    drive: ['WASD', 'вожња'],
    aim: ['Миш', 'нишан; поглед гледа унапред'],
    fire: ['ЛТМ · Размак', 'пуцај док држиш'],
    charge: ['Снајпер', 'држи за пуњење, пусти'],
    turn: ['ДТМ · Shift', 'окрет у месту'],
    view: ['Q · E', 'окрени поглед'],
    zoom: ['Точкић · + −', 'зум'],
    class: ['1–5 · C', 'класа'],
    follow: ['V, па 1–8 · 0', 'прати тенк · мапа']
  },
  look: { dots: 'Тачке', line: 'Линија', dash: 'Цртице' },
  lookNotice: (look: string) => `Нишан: ${look} (X)`,
  tankClass: {
    scout: 'Извиђач',
    soldier: 'Војник',
    heavy: 'Тешкаш',
    demoman: 'Минер',
    sniper: 'Снајпер'
  },
  short: { scout: 'Из', soldier: 'Во', heavy: 'Тш', demoman: 'Ми', sniper: 'Сн' },
  classRole: {
    scout: 'Брз, заобилази бокове; сачмара из близине, најопаснија с леђа; осваја дупло брже',
    soldier: 'Ракете с експлозијом и гелерима; пуцањ под ноге — ракетни скок',
    heavy: 'Спор, у плочама; рафал гатлинга буши оклоп изблиза; држи тачку',
    demoman: 'Баца гранате које одскачу преко заклона; велика експлозија; руши зидове',
    sniper: 'Казамат: држи за пуњење; нишан показује језгра; шина кроз језгро убија'
  },
  classMenu: {
    title: 'Изабери класу',
    speed: 'Брзина',
    armor: 'Оклоп',
    reach: 'Домет',
    current: 'сада',
    next: 'следећи респаун',
    hint: '1–5 или клик · у бази се мења одмах, другде при следећем респауну · C или Esc затвара'
  },
  botRole: { assault: 'јуриш', flank: 'бок', support: 'подршка', anchor: 'сидро', sniper: 'снајпер' },
  seat: {
    you: 'Ти',
    youBot: 'Ти (бот)',
    red: (seat: number) => `Црвени ${seat}`,
    blue: (seat: number) => `Плави ${seat}`
  },
  hud: {
    kills: (count: number) => `${count} ${KILLS[SERBIAN_PLURALS.select(count) as keyof typeof KILLS] ?? KILLS.other}`,
    locked: 'Закључано',
    overtime: 'Продужетак',
    contested: 'Спорно',
    respawn: (seconds: number, tankClass: string) => `Респаун за ${seconds} s · ${tankClass}`,
    changeClass: 'C или 1–5: промени класу',
    coreOpen: 'Језгро откривено — у заклон или у базу',
    mending: 'Оклоп се поправља',
    nextRespawn: (tankClass: string) => `Следећи респаун: ${tankClass}`,
    gauge: { idle: 'Држи', charging: 'Пуњење', full: 'Пуно' }
  },
  plan: { push: 'напад', hold: 'одбрана', regroup: 'прегруписавање', gather: 'окупљају се', go: 'улазе' },
  result: {
    wins: { red: 'Црвени побеђују', blue: 'Плави побеђују' },
    team: { red: 'Црвени', blue: 'Плави' },
    held: (seconds: number) => `држали ${seconds} s`,
    kills: 'У',
    deaths: 'С',
    again: 'Играј поново'
  }
};

const SERBIAN_PLURALS = new Intl.PluralRules('sr');
const KILLS = { one: 'убиство', few: 'убиства', other: 'убистава' };
