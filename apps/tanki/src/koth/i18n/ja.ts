import type { Dictionary } from './en';

/** The game's Japanese text; the class names follow the Japanese Team Fortress 2. */
export const ja: Dictionary = {
  title: { game: 'タンキ', mode: 'キング・オブ・ザ・ヒル' },
  menu: {
    paused: '一時停止',
    open: 'Esc · メニュー',
    match: '試合',
    resume: '再開',
    resumeHint: '戦闘に戻る',
    restart: 'リスタート',
    restartHint: '新しい試合',
    class: 'クラス',
    watch: '観戦',
    watchHint: 'ボットが操縦',
    takeTank: '戦車に戻る',
    takeTankHint: 'プレイ再開',
    view: '表示',
    aim: '照準',
    thoughts: 'ボットの思考',
    off: 'オフ',
    on: 'オン',
    language: '言語',
    pace: 'ペース',
    reset: 'リセット',
    derived: (drive: number, shell: number, from: string, to: string) =>
      `中戦車 ${drive} px/s · 砲弾 ${shell} px/s · ボットの反応 ${from}–${to} 秒`,
    keys: '操作'
  },
  knob: {
    speed: 'ゲーム速度',
    tankSpeed: '戦車の速度',
    shellSpeed: '砲弾の速度',
    damage: 'ダメージ',
    botReaction: 'ボットの反応',
    botSight: 'ボットの視界',
    zoom: 'ズーム',
    lead: 'カメラの先読み'
  },
  keys: {
    drive: ['WASD', '移動'],
    aim: ['マウス', '照準・視点が先を映す'],
    fire: ['左クリック · Space', '押している間射撃'],
    charge: ['スナイパー', '押してチャージ、離して発射'],
    turn: ['右クリック · Shift', 'その場で旋回'],
    view: ['Q · E', '視点を回す'],
    zoom: ['ホイール · + −', 'ズーム'],
    class: ['1–5 · C', 'クラス'],
    follow: ['V → 1–8 · 0', '戦車を追う · 全体マップ']
  },
  look: { dots: 'ドット', line: 'ライン', dash: '破線' },
  lookNotice: (look: string) => `照準: ${look} (X)`,
  tankClass: {
    scout: 'スカウト',
    soldier: 'ソルジャー',
    heavy: 'ヘビー',
    demoman: 'デモマン',
    sniper: 'スナイパー'
  },
  short: { scout: 'スカ', soldier: 'ソル', heavy: 'ヘビ', demoman: 'デモ', sniper: 'スナ' },
  classRole: {
    scout: '高速で側面へ。至近距離の散弾、背後から最も危険。占拠速度2倍',
    soldier: '爆風と破片のロケット。足元に撃ってロケットジャンプ',
    heavy: '低速・重装甲。至近距離で装甲を削るガトリング。拠点を守る',
    demoman: '遮蔽物越しに跳ねるグレネードを投げる。大爆発。壁を壊す',
    sniper: '固定砲：押してチャージ。スコープでコアが見える。レールがコアを貫けば撃破'
  },
  classMenu: {
    title: 'クラス選択',
    speed: '速度',
    armor: '装甲',
    reach: '射程',
    current: '現在',
    next: '次のリスポーン',
    hint: '1–5 またはクリックで選択 · 自陣ならすぐ、他では次のリスポーンで変更 · C か Esc で閉じる'
  },
  botRole: { assault: '突撃', flank: '側面', support: '援護', anchor: '守備', sniper: '狙撃' },
  seat: {
    you: 'あなた',
    youBot: 'あなた (ボット)',
    red: (seat: number) => `赤 ${seat}`,
    blue: (seat: number) => `青 ${seat}`
  },
  hud: {
    kills: (count: number) => `${count} キル`,
    locked: 'ロック中',
    overtime: '延長戦',
    contested: '争奪中',
    respawn: (seconds: number, tankClass: string) => `${seconds} 秒後に${tankClass}でリスポーン`,
    changeClass: 'C か 1–5: クラス変更',
    coreOpen: 'コアがむき出し — 遮蔽物か自陣へ',
    mending: '装甲を修理中',
    nextRespawn: (tankClass: string) => `次のリスポーン: ${tankClass}`,
    gauge: { idle: '押す', charging: 'チャージ', full: '最大' }
  },
  plan: { push: '進撃', hold: '防衛', regroup: '再集結', gather: '集合中', go: '突入' },
  result: {
    wins: { red: '赤チームの勝利', blue: '青チームの勝利' },
    team: { red: '赤', blue: '青' },
    held: (seconds: number) => `確保 ${seconds} 秒`,
    kills: 'K',
    deaths: 'D',
    again: 'もう一度'
  }
};
