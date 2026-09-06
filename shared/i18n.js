// ============================================================================
// i18n: lightweight translation layer.
//   - Four locales: zh-CN, zh-TW, en, ja
//   - Locale auto-detected from navigator.languages (override via ?lang=)
//   - t(key, params) for JS strings; applyDom() for [data-i18n] elements
// ============================================================================

const DICTS = {
  "zh-CN": {
    "app.title": "FFTA DEMO",
    "h.controls": "操作",
    "ctrl.rotate": "旋转视角（4 方向，平滑过渡）",
    "ctrl.unit": "点击单位 — 查看状态",
    "ctrl.tile": "点击蓝色 tile — 移动",
    "ctrl.enemy": "点击敌方 — 攻击（近战或扔雪球）",
    "ctrl.toggle": "切换学校贴图 / 白模型",
    "h.legend": "单位图例",
    "legend.player": "玩家方: Marche / Lyle / Ritz",
    "legend.enemy": "敌方: Colm / Guinness / Mewt",
    "info.initializing": "初始化中…",
    "h.turn_order": "回合顺序",
    "btn.move": "移动",
    "btn.attack": "攻击",
    "btn.wait": "等待",
    "btn.moved": "已移动 ✓",
    "btn.acted": "已行动 ✓",
    "end.victory": "胜利！",
    "end.victory_sub": "敌方全灭。",
    "end.defeat": "败北…",
    "end.defeat_sub": "玩家方全灭。",
    "end.restart": "重新开始",
    "info.loading_sprites": "加载精灵中…",
    "info.ready": "就绪 — Q/E 旋转视角，B 切换贴图/白模型",
    "info.school_tex": "立体学校：墙面、屋顶和烟囱的贴图随模型旋转。",
    "info.school_white": "学校白模型与地图地形（B 切回贴图）。",
    "info.init_failed": "初始化失败: {msg}",
    "info.no_units": "没有单位可以行动。",
    "turn.player": "{name} 的回合 — 选择行动。",
    "turn.enemy": "{name} (敌方) 回合 — AI 思考中…",
    "bar.now": "现在",
    "bar.waiting": "等待中…",
    "hint.move": "{name} — 点击蓝色 tile 选择移动目标。",
    "hint.attack": "{name} — 点击敌人进行攻击（近战或扔雪球）。",
    "hint.too_far": "{name} 太远（距离 {d}），雪球射程 5。",
    "hint.moving": "{name} 移动中… 可继续攻击或点「等待」结束回合。",
    "hint.turn": "{name} 的回合 — 点击蓝 tile 移动，点敌人攻击，或点「等待」结束。",
    "card.team_player": "玩家方",
    "card.team_enemy": "敌方",
    "card.facing": "朝向",
    "facing.nesw": "北,东,南,西",
    "log.attack": "{a} 攻击 {b}！",
    "log.hit_done": "{name} 受击完毕。",
    "log.hit": "{a} 命中 {b}！伤害 {d}，HP {hp}/{max}",
    "log.throw": "{a} 向 {b} 扔雪球！",
    "map.0": "map000 - 雪球战",
    "map.74": "map074 - 跳跃测试 (h2~8, max diff 2)",
    "err.school_load": "学校模型加载失败 ({status})",
    "err.school_ratio": "学校模型与地图高度比例不同，请重新运行 tools/build_school.py",
  },
  "zh-TW": {
    "app.title": "FFTA DEMO",
    "h.controls": "操作",
    "ctrl.rotate": "旋轉視角（4 方向，平滑過渡）",
    "ctrl.unit": "點擊單位 — 查看狀態",
    "ctrl.tile": "點擊藍色格子 — 移動",
    "ctrl.enemy": "點擊敵方 — 攻擊（近戰或丟雪球）",
    "ctrl.toggle": "切換學校貼圖 / 白模型",
    "h.legend": "單位圖例",
    "legend.player": "玩家方: Marche / Lyle / Ritz",
    "legend.enemy": "敵方: Colm / Guinness / Mewt",
    "info.initializing": "初始化中…",
    "h.turn_order": "行動順序",
    "btn.move": "移動",
    "btn.attack": "攻擊",
    "btn.wait": "等待",
    "btn.moved": "已移動 ✓",
    "btn.acted": "已行動 ✓",
    "end.victory": "勝利！",
    "end.victory_sub": "敵方全滅。",
    "end.defeat": "敗北…",
    "end.defeat_sub": "玩家方全滅。",
    "end.restart": "重新開始",
    "info.loading_sprites": "載入精靈圖中…",
    "info.ready": "就緒 — Q/E 旋轉視角，B 切換貼圖/白模型",
    "info.school_tex": "立體學校：牆面、屋頂和煙囪的貼圖隨模型旋轉。",
    "info.school_white": "學校白模型與地圖地形（B 切回貼圖）。",
    "info.init_failed": "初始化失敗: {msg}",
    "info.no_units": "沒有單位可以行動。",
    "turn.player": "{name} 的回合 — 選擇行動。",
    "turn.enemy": "{name}（敵方）回合 — AI 思考中…",
    "bar.now": "現在",
    "bar.waiting": "等待中…",
    "hint.move": "{name} — 點擊藍色格子選擇移動目標。",
    "hint.attack": "{name} — 點擊敵人進行攻擊（近戰或丟雪球）。",
    "hint.too_far": "{name} 太遠（距離 {d}），雪球射程 5。",
    "hint.moving": "{name} 移動中… 可繼續攻擊或點「等待」結束回合。",
    "hint.turn": "{name} 的回合 — 點藍格子移動，點敵人攻擊，或點「等待」結束。",
    "card.team_player": "玩家方",
    "card.team_enemy": "敵方",
    "card.facing": "朝向",
    "facing.nesw": "北,東,南,西",
    "log.attack": "{a} 攻擊 {b}！",
    "log.hit_done": "{name} 受擊完畢。",
    "log.hit": "{a} 命中 {b}！傷害 {d}，HP {hp}/{max}",
    "log.throw": "{a} 向 {b} 丟雪球！",
    "map.0": "map000 - 雪球戰",
    "map.74": "map074 - 跳躍測試 (h2~8, max diff 2)",
    "err.school_load": "學校模型載入失敗 ({status})",
    "err.school_ratio": "學校模型與地圖高度比例不同，請重新執行 tools/build_school.py",
  },
  "en": {
    "app.title": "FFTA DEMO",
    "h.controls": "Controls",
    "ctrl.rotate": "Rotate camera (4 directions, smooth tween)",
    "ctrl.unit": "Click a unit — view status",
    "ctrl.tile": "Click a blue tile — move",
    "ctrl.enemy": "Click an enemy — attack (melee or snowball)",
    "ctrl.toggle": "Toggle school texture / white model",
    "h.legend": "Units",
    "legend.player": "Player: Marche / Lyle / Ritz",
    "legend.enemy": "Enemy: Colm / Guinness / Mewt",
    "info.initializing": "Initializing…",
    "h.turn_order": "Turn Order",
    "btn.move": "Move",
    "btn.attack": "Attack",
    "btn.wait": "Wait",
    "btn.moved": "Moved ✓",
    "btn.acted": "Acted ✓",
    "end.victory": "Victory!",
    "end.victory_sub": "All enemies defeated.",
    "end.defeat": "Defeat…",
    "end.defeat_sub": "Your party has fallen.",
    "end.restart": "Restart",
    "info.loading_sprites": "Loading sprites…",
    "info.ready": "Ready — Q/E rotate camera, B toggle texture/white model",
    "info.school_tex": "Textured school: walls, roof and chimney textures rotate with the model.",
    "info.school_white": "White-model school with map terrain (press B to switch back).",
    "info.init_failed": "Init failed: {msg}",
    "info.no_units": "No unit can act.",
    "turn.player": "{name}'s turn — choose an action.",
    "turn.enemy": "{name} (enemy) turn — AI thinking…",
    "bar.now": "Now",
    "bar.waiting": "Waiting…",
    "hint.move": "{name} — click a blue tile to choose a move target.",
    "hint.attack": "{name} — click an enemy to attack (melee or snowball).",
    "hint.too_far": "{name} is too far (distance {d}), snowball range is 5.",
    "hint.moving": "{name} is moving… You can still attack, or click \"Wait\" to end the turn.",
    "hint.turn": "{name}'s turn — click a blue tile to move, click an enemy to attack, or \"Wait\" to end.",
    "card.team_player": "Player",
    "card.team_enemy": "Enemy",
    "card.facing": "Facing",
    "facing.nesw": "N,E,S,W",
    "log.attack": "{a} attacks {b}!",
    "log.hit_done": "{name} recovered from the hit.",
    "log.hit": "{a} hits {b}! Damage {d}, HP {hp}/{max}",
    "log.throw": "{a} throws a snowball at {b}!",
    "map.0": "map000 - Snowball Fight",
    "map.74": "map074 - Jump test (h2~8, max diff 2)",
    "err.school_load": "Failed to load school model ({status})",
    "err.school_ratio": "School model height ratio differs from the map; re-run tools/build_school.py",
  },
  "ja": {
    "app.title": "FFTA DEMO",
    "h.controls": "操作",
    "ctrl.rotate": "カメラ回転（4 方向、スムーズ遷移）",
    "ctrl.unit": "ユニットをクリック — ステータス表示",
    "ctrl.tile": "青いタイルをクリック — 移動",
    "ctrl.enemy": "敵をクリック — 攻撃（近接または雪玉）",
    "ctrl.toggle": "学校のテクスチャ / 白モデルを切替",
    "h.legend": "ユニット一覧",
    "legend.player": "プレイヤー側: Marche / Lyle / Ritz",
    "legend.enemy": "敵側: Colm / Guinness / Mewt",
    "info.initializing": "初期化中…",
    "h.turn_order": "行動順序",
    "btn.move": "移動",
    "btn.attack": "攻撃",
    "btn.wait": "待機",
    "btn.moved": "移動済 ✓",
    "btn.acted": "行動済 ✓",
    "end.victory": "勝利！",
    "end.victory_sub": "敵を全滅させた。",
    "end.defeat": "敗北…",
    "end.defeat_sub": "プレイヤー側が全滅した。",
    "end.restart": "リスタート",
    "info.loading_sprites": "スプライト読み込み中…",
    "info.ready": "準備完了 — Q/E でカメラ回転、B でテクスチャ/白モデル切替",
    "info.school_tex": "テクスチャ付き学校：壁・屋根・煙突のテクスチャがモデルと一緒に回転する。",
    "info.school_white": "白モデルの学校とマップ地形（B でテクスチャに戻す）。",
    "info.init_failed": "初期化に失敗しました: {msg}",
    "info.no_units": "行動できるユニットがいません。",
    "turn.player": "{name} のターン — 行動を選択してください。",
    "turn.enemy": "{name}（敵）のターン — AI 思考中…",
    "bar.now": "現在",
    "bar.waiting": "待機中…",
    "hint.move": "{name} — 青いタイルをクリックして移動先を選択。",
    "hint.attack": "{name} — 敵をクリックして攻撃（近接または雪玉）。",
    "hint.too_far": "{name} が遠すぎます（距離 {d}）、雪玉の射程は 5。",
    "hint.moving": "{name} 移動中… 攻撃を続けるか、「待機」でターン終了。",
    "hint.turn": "{name} のターン — 青タイルで移動、敵クリックで攻撃、「待機」で終了。",
    "card.team_player": "プレイヤー側",
    "card.team_enemy": "敵側",
    "card.facing": "向き",
    "facing.nesw": "北,東,南,西",
    "log.attack": "{a} が {b} に攻撃！",
    "log.hit_done": "{name} は被弾から復帰した。",
    "log.hit": "{a} が {b} に命中！ダメージ {d}、HP {hp}/{max}",
    "log.throw": "{a} が {b} に雪玉を投げた！",
    "map.0": "map000 - 雪合戦",
    "map.74": "map074 - ジャンプテスト (h2~8, max diff 2)",
    "err.school_load": "学校モデルの読み込みに失敗しました ({status})",
    "err.school_ratio": "学校モデルとマップの高さ比率が一致しません。tools/build_school.py を再実行してください",
  },
};

// Locale detection: ?lang= override > navigator.languages > fallback en.
// zh-Hans* / zh-CN / zh-SG → zh-CN; zh-Hant* / zh-TW / zh-HK / zh-MO → zh-TW.
function detectLocale() {
  const urlLang = new URLSearchParams(location.search).get("lang");
  const candidates = urlLang
    ? [urlLang]
    : [...(navigator.languages || []), navigator.language || ""];
  for (const raw of candidates) {
    if (!raw) continue;
    const lang = raw.toLowerCase();
    if (lang.startsWith("zh")) {
      if (/hant|tw|hk|mo/.test(lang)) return "zh-TW";
      return "zh-CN";
    }
    if (lang.startsWith("ja")) return "ja";
    if (lang.startsWith("en")) return "en";
  }
  return "en";
}

let locale = detectLocale();

/** Translate a key with {placeholder} substitution. Falls back to en, then key. */
export function t(key, params) {
  const str = DICTS[locale]?.[key] ?? DICTS.en[key] ?? key;
  if (!params) return str;
  return str.replace(/\{(\w+)\}/g, (_, name) => params[name] ?? `{${name}}`);
}

/** Split a comma-list key (e.g. facing names) into an array. */
export function tList(key) {
  return t(key).split(",");
}

export function getLocale() {
  return locale;
}

/** Apply translations to all [data-i18n] elements + <title> + <html lang>. */
export function applyDom() {
  document.documentElement.lang = locale === "zh-TW" ? "zh-TW" : locale;
  for (const el of document.querySelectorAll("[data-i18n]")) {
    el.textContent = t(el.dataset.i18n);
  }
}
