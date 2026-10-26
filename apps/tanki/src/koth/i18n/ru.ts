import type { Dictionary } from './en';

/** The game's Russian text; the class names follow the Russian Team Fortress 2. */
export const ru: Dictionary = {
  title: { game: 'Танки', mode: 'Царь горы' },
  menu: {
    paused: 'Пауза',
    open: 'Esc · меню',
    match: 'Матч',
    resume: 'Продолжить',
    resumeHint: 'назад в бой',
    restart: 'Заново',
    restartHint: 'новый матч',
    class: 'Класс',
    watch: 'Смотреть',
    watchHint: 'ведёт бот',
    takeTank: 'Вернуть танк',
    takeTankHint: 'играть снова',
    view: 'Вид',
    aim: 'Прицел',
    thoughts: 'Мысли ботов',
    off: 'Выкл',
    on: 'Вкл',
    language: 'Язык',
    pace: 'Темп',
    reset: 'Сброс',
    derived: (drive: number, shell: number, from: string, to: string) =>
      `Средний танк ${drive} px/с · его снаряд ${shell} px/с · боты реагируют за ${from}–${to} с`,
    keys: 'Клавиши'
  },
  knob: {
    speed: 'Скорость игры',
    tankSpeed: 'Скорость танков',
    shellSpeed: 'Скорость снарядов',
    damage: 'Урон',
    botReaction: 'Реакция ботов',
    botSight: 'Обзор ботов',
    zoom: 'Масштаб',
    lead: 'Упреждение камеры'
  },
  keys: {
    drive: ['WASD', 'ехать'],
    aim: ['Мышь', 'целиться; вид смотрит вперёд'],
    fire: ['ЛКМ · Пробел', 'огонь, пока зажато'],
    charge: ['Снайпер', 'зажать — заряд, отпустить — выстрел'],
    turn: ['ПКМ · Shift', 'разворот на месте'],
    view: ['Q · E', 'повернуть вид'],
    zoom: ['Колесо · + −', 'масштаб'],
    class: ['1–5 · C', 'класс'],
    follow: ['V, потом 1–8 · 0', 'следить за танком · карта']
  },
  look: { dots: 'Точки', line: 'Линия', dash: 'Штрихи' },
  lookNotice: (look: string) => `Прицел: ${look} (X)`,
  tankClass: {
    scout: 'Разведчик',
    soldier: 'Солдат',
    heavy: 'Пулемётчик',
    demoman: 'Подрывник',
    sniper: 'Снайпер'
  },
  short: { scout: 'Рз', soldier: 'Сл', heavy: 'Пл', demoman: 'Пд', sniper: 'Сн' },
  classRole: {
    scout: 'Быстрый, обходит с флангов; дробовик в упор, страшнее всего сзади; захват ×2',
    soldier: 'Ракеты с осколками и взрывом; выстрел себе под ноги — ракетный прыжок',
    heavy: 'Медленный, в плитах; поток пуль сверлит броню вблизи; держит точку',
    demoman: 'Навесом бросает прыгающие гранаты из-за укрытия; большой взрыв; ломает стены',
    sniper: 'Каземат: зажать для заряда; прицел видит ядра; рельса через ядро убивает'
  },
  classMenu: {
    title: 'Выбор класса',
    speed: 'Скорость',
    armor: 'Броня',
    reach: 'Дальность',
    current: 'сейчас',
    next: 'при возрождении',
    hint: '1–5 или клик · на базе класс сменится сразу, иначе при следующем возрождении · C или Esc закрывает'
  },
  botRole: { assault: 'штурм', flank: 'фланг', support: 'поддержка', anchor: 'якорь', sniper: 'снайпер' },
  seat: {
    you: 'Вы',
    youBot: 'Вы (бот)',
    red: (seat: number) => `Красный ${seat}`,
    blue: (seat: number) => `Синий ${seat}`
  },
  hud: {
    kills: (count: number) => `${count} ${KILLS[RUSSIAN_PLURALS.select(count) as keyof typeof KILLS] ?? KILLS.many}`,
    locked: 'Закрыта',
    overtime: 'Овертайм',
    contested: 'Спорная',
    respawn: (seconds: number, tankClass: string) => `Возрождение через ${seconds} · ${tankClass}`,
    changeClass: 'C или 1–5: сменить класс',
    coreOpen: 'Ядро открыто — в укрытие или на базу',
    mending: 'Броня чинится',
    nextRespawn: (tankClass: string) => `Следующее возрождение: ${tankClass}`,
    gauge: { idle: 'Зажать', charging: 'Заряд', full: 'Полный' }
  },
  plan: { push: 'натиск', hold: 'оборона', regroup: 'сбор', gather: 'собираются', go: 'идут' },
  result: {
    wins: { red: 'Победа красных', blue: 'Победа синих' },
    team: { red: 'Красные', blue: 'Синие' },
    held: (seconds: number) => `держали ${seconds} с`,
    kills: 'У',
    deaths: 'С',
    again: 'Ещё раз'
  }
};

const RUSSIAN_PLURALS = new Intl.PluralRules('ru');
const KILLS = { one: 'убийство', few: 'убийства', many: 'убийств' };
