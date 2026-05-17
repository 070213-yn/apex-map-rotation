// Apex マップローテーション計算 & 表示
// 規則: 4時間30分ごとに ブロークンムーン → キングスキャニオン → オリンパス の順でループ
// 起点: 2026-05-11 17:00 JST = ブロークンムーン

// --- 定数 ---
const ANCHOR_UTC = Date.UTC(2026, 4, 11, 8, 0, 0); // 2026-05-11 17:00 JST = 08:00 UTC
const SLOT_MS = 4.5 * 60 * 60 * 1000;
const HORIZON_MS = 7 * 24 * 60 * 60 * 1000;       // 1週間
const FILTER_KEY = "apex_map_filter_v1";

const MAPS = [
  { id: "broken_moon",  name: "ブロークンムーン",   image: "images/broken_moon.jpg" },
  { id: "kings_canyon", name: "キングスキャニオン", image: "images/kings_canyon.jpg" },
  { id: "olympus",      name: "オリンパス",         image: "images/olympus.jpg" },
];

// --- フィルタ状態 ---
let activeFilter = loadFilter(); // Set<mapId>

function loadFilter() {
  try {
    const raw = localStorage.getItem(FILTER_KEY);
    if (raw === null) return new Set(MAPS.map(m => m.id)); // 初回のみ全選択
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return new Set(MAPS.map(m => m.id));
    return new Set(arr.filter(id => MAPS.some(m => m.id === id))); // 空配列も許可
  } catch {
    return new Set(MAPS.map(m => m.id));
  }
}

function saveFilter() {
  try { localStorage.setItem(FILTER_KEY, JSON.stringify([...activeFilter])); } catch {}
}

// --- スロット計算 ---
function slotForTime(t) {
  const idx = Math.floor((t - ANCHOR_UTC) / SLOT_MS);
  const start = ANCHOR_UTC + idx * SLOT_MS;
  const end = start + SLOT_MS;
  const map = MAPS[((idx % MAPS.length) + MAPS.length) % MAPS.length];
  return { idx, start, end, map };
}

function nextSlot(slot) {
  const idx = slot.idx + 1;
  const start = slot.end;
  const end = start + SLOT_MS;
  const map = MAPS[((idx % MAPS.length) + MAPS.length) % MAPS.length];
  return { idx, start, end, map };
}

function buildSlots(now, horizonMs) {
  const horizon = now + horizonMs;
  const out = [];
  let s = slotForTime(now);
  while (s.start < horizon) {
    out.push(s);
    s = nextSlot(s);
  }
  return out;
}

// --- JST 表示用ヘルパー ---
function jstParts(ms) {
  const fmt = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    weekday: "short",
    hour12: false,
  });
  const parts = {};
  for (const p of fmt.formatToParts(new Date(ms))) {
    if (p.type !== "literal") parts[p.type] = p.value;
  }
  return {
    year: parseInt(parts.year, 10),
    month: parseInt(parts.month, 10),
    day: parseInt(parts.day, 10),
    hour: parseInt(parts.hour, 10) % 24,
    minute: parseInt(parts.minute, 10),
    second: parseInt(parts.second, 10),
    weekday: parts.weekday,
  };
}

const pad2 = n => String(n).padStart(2, "0");

function fmtTime(ms) {
  const p = jstParts(ms);
  return `${pad2(p.hour)}:${pad2(p.minute)}`;
}

function fmtDayKey(ms) {
  const p = jstParts(ms);
  return `${p.year}-${pad2(p.month)}-${pad2(p.day)}`;
}

function fmtDayLabel(ms) {
  const p = jstParts(ms);
  return { date: `${p.month}/${p.day}`, weekday: p.weekday };
}

function fmtCountdown(ms) {
  if (ms < 0) ms = 0;
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${pad2(h)}:${pad2(m)}:${pad2(s)}`;
}

function fmtHoursMinutes(ms) {
  if (ms < 0) ms = 0;
  const total = Math.floor(ms / 60000);
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m}分後`;
  if (m === 0) return `${h}時間後`;
  return `${h}時間${m}分後`;
}

// --- レンダリング ---
function renderCurrent(now) {
  const cur = slotForTime(now);
  const nxt = nextSlot(cur);

  const card = document.getElementById("current-card");
  card.classList.remove("map-broken_moon", "map-kings_canyon", "map-olympus");
  card.classList.add(`map-${cur.map.id}`);

  document.getElementById("current-image").style.backgroundImage = `url("${cur.map.image}")`;
  document.getElementById("current-name").textContent = cur.map.name;
  document.getElementById("current-time").textContent =
    `${fmtTime(cur.start)} 〜 ${fmtTime(cur.end)} (JST)`;
  document.getElementById("next-name").textContent = nxt.map.name;

  // タブタイトルとファビコン
  document.title = `${cur.map.name} | Apex ローテ早見表`;
  updateFavicon(cur.map.id);
}

// ===== 動的ファビコン (現在マップの色で生成) =====
function updateFavicon(mapId) {
  const colors = {
    broken_moon: "#5dd8ff",
    kings_canyon: "#ff6b3d",
    olympus: "#c77dff",
  };
  const letters = {
    broken_moon: "ブ",
    kings_canyon: "キ",
    olympus: "オ",
  };
  const size = 64;
  const c = document.createElement("canvas");
  c.width = size; c.height = size;
  const ctx = c.getContext("2d");
  // 外周（黒）
  ctx.fillStyle = "#0a0a0f";
  ctx.beginPath();
  ctx.arc(size/2, size/2, size/2, 0, Math.PI * 2);
  ctx.fill();
  // 内側カラー円
  ctx.fillStyle = colors[mapId] || "#ff4655";
  ctx.beginPath();
  ctx.arc(size/2, size/2, size/2 - 4, 0, Math.PI * 2);
  ctx.fill();
  // 文字
  ctx.fillStyle = "#0a0a0f";
  ctx.font = `bold ${Math.floor(size * 0.6)}px "Noto Sans JP", sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(letters[mapId] || "?", size/2, size/2 + 2);

  let link = document.getElementById("favicon-link");
  if (!link) {
    link = document.createElement("link");
    link.id = "favicon-link";
    link.rel = "icon";
    document.head.appendChild(link);
  }
  link.type = "image/png";
  link.href = c.toDataURL("image/png");
}

// ===== シェア =====
function buildShareText() {
  const cur = slotForTime(Date.now());
  const nxt = nextSlot(cur);
  return `現在のApexランクマップは「${cur.map.name}」(${fmtTime(cur.start)}〜${fmtTime(cur.end)})\n次は「${nxt.map.name}」\n\n#ApexLegends #エペ #ランクマップローテーション早見表`;
}

function shareToX() {
  const url = location.origin + location.pathname;
  const text = buildShareText();
  const intent = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
  window.open(intent, "_blank", "noopener,noreferrer");
}

async function copyURL(btn) {
  const url = location.origin + location.pathname;
  const orig = btn.textContent;
  try {
    await navigator.clipboard.writeText(url);
    btn.textContent = "コピー完了!";
  } catch {
    // 古いブラウザ向けフォールバック
    const ta = document.createElement("textarea");
    ta.value = url; document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); btn.textContent = "コピー完了!"; }
    catch { btn.textContent = "コピー失敗"; }
    document.body.removeChild(ta);
  }
  setTimeout(() => { btn.textContent = orig; }, 1600);
}

function renderCountdown(now) {
  const cur = slotForTime(now);
  document.getElementById("countdown").textContent = fmtCountdown(cur.end - now);
}

// 次の各マップまでの登場時間を計算
function findNextOccurrenceForEach(now) {
  const cur = slotForTime(now);
  const result = {};
  // 現在マップは LIVE 扱い
  result[cur.map.id] = { slot: cur, isLive: true };
  // 残り2マップを未来から探す
  let s = nextSlot(cur);
  while (Object.keys(result).length < MAPS.length) {
    if (!result[s.map.id]) {
      result[s.map.id] = { slot: s, isLive: false };
    }
    s = nextSlot(s);
  }
  return result;
}

function renderNextEach(now) {
  const occ = findNextOccurrenceForEach(now);
  const container = document.getElementById("next-each");
  container.innerHTML = "";
  for (const m of MAPS) {
    const info = occ[m.id];
    const card = document.createElement("div");
    card.className = `next-each-card map-${m.id}` + (info.isLive ? " live" : "");

    const name = document.createElement("div");
    name.className = "next-each-name";
    name.textContent = m.name;

    const time = document.createElement("div");
    time.className = "next-each-time";
    if (info.isLive) {
      time.textContent = `LIVE (残 ${fmtCountdown(info.slot.end - now)})`;
    } else {
      time.textContent = fmtHoursMinutes(info.slot.start - now);
    }

    const when = document.createElement("div");
    when.className = "next-each-when";
    const startLabel = fmtDayLabel(info.slot.start);
    when.textContent = info.isLive
      ? `〜 ${fmtTime(info.slot.end)}`
      : `${startLabel.date}(${startLabel.weekday}) ${fmtTime(info.slot.start)} 〜 ${fmtTime(info.slot.end)}`;

    card.appendChild(name);
    card.appendChild(time);
    card.appendChild(when);
    container.appendChild(card);
  }
}

// 凡例（フィルタUI）。マップごとの合計時間もここに表示
function renderLegend(slots) {
  const totals = {};
  for (const m of MAPS) totals[m.id] = 0;
  for (const s of slots) totals[s.map.id] += SLOT_MS;

  const legend = document.getElementById("legend");
  legend.innerHTML = "";
  for (const m of MAPS) {
    const item = document.createElement("button");
    item.type = "button";
    item.className = `legend-item map-${m.id}` + (activeFilter.has(m.id) ? "" : " off");
    item.dataset.mapId = m.id;
    item.setAttribute("aria-pressed", activeFilter.has(m.id) ? "true" : "false");

    const dot = document.createElement("span");
    dot.className = "dot";
    const label = document.createElement("span");
    label.textContent = m.name;
    const hours = document.createElement("span");
    hours.className = "hours";
    const h = Math.round(totals[m.id] / 3600000 * 10) / 10;
    hours.textContent = `(${h}h)`;

    item.appendChild(dot);
    item.appendChild(label);
    item.appendChild(hours);

    item.addEventListener("click", () => {
      if (activeFilter.has(m.id)) {
        activeFilter.delete(m.id); // 最後の1つもOFFにできる
      } else {
        activeFilter.add(m.id);
      }
      saveFilter();
      renderLegend(slots);
      applyFilterClasses();
    });

    legend.appendChild(item);
  }
}

function applyFilterClasses() {
  // 全選択 = 絞り込みなし扱い。全OFFは「全部薄く」表示
  const allSelected = activeFilter.size === MAPS.length;
  document.querySelectorAll(".slot").forEach(el => {
    const id = el.dataset.mapId;
    if (allSelected || activeFilter.has(id)) {
      el.classList.remove("filtered-out");
    } else {
      el.classList.add("filtered-out");
    }
  });
}

function renderDayNav(slots) {
  const days = [];
  const seen = new Set();
  for (const s of slots) {
    const key = fmtDayKey(s.start);
    if (!seen.has(key)) {
      seen.add(key);
      days.push({ key, label: fmtDayLabel(s.start) });
    }
  }
  const nav = document.getElementById("day-nav");
  nav.innerHTML = "";
  const todayKey = fmtDayKey(Date.now());
  for (const d of days) {
    const a = document.createElement("a");
    a.href = `#day-${d.key}`;
    a.textContent = `${d.label.date}(${d.label.weekday})`;
    if (d.key === todayKey) a.classList.add("today");
    nav.appendChild(a);
  }
}

function renderSchedule(slots) {
  const startSlot = slots[0];

  const groups = new Map();
  for (const slot of slots) {
    const key = fmtDayKey(slot.start);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(slot);
  }

  const schedule = document.getElementById("schedule");
  schedule.innerHTML = "";

  for (const [key, list] of groups) {
    const block = document.createElement("section");
    block.className = "day-block";
    block.id = `day-${key}`;

    const head = document.createElement("div");
    head.className = "day-heading";
    const label = fmtDayLabel(list[0].start);
    const dateEl = document.createElement("span");
    dateEl.className = "day-date";
    dateEl.textContent = label.date;
    const wdEl = document.createElement("span");
    wdEl.className = "day-weekday";
    if (label.weekday === "土") wdEl.classList.add("sat");
    if (label.weekday === "日") wdEl.classList.add("sun");
    wdEl.textContent = `(${label.weekday})`;
    head.appendChild(dateEl);
    head.appendChild(wdEl);
    block.appendChild(head);

    const grid = document.createElement("div");
    grid.className = "slot-grid";

    for (const slot of list) {
      const el = document.createElement("div");
      el.className = `slot map-${slot.map.id}`;
      el.dataset.mapId = slot.map.id;
      if (slot.idx === startSlot.idx) el.classList.add("now");

      const thumb = document.createElement("div");
      thumb.className = "slot-thumb";
      thumb.style.backgroundImage = `url("${slot.map.image}")`;

      const body = document.createElement("div");
      body.className = "slot-body";
      const time = document.createElement("div");
      time.className = "slot-time";
      time.textContent = `${fmtTime(slot.start)} 〜 ${fmtTime(slot.end)}`;
      const name = document.createElement("div");
      name.className = "slot-map";
      name.textContent = slot.map.name;
      body.appendChild(time);
      body.appendChild(name);

      el.appendChild(thumb);
      el.appendChild(body);
      grid.appendChild(el);
    }

    block.appendChild(grid);
    schedule.appendChild(block);
  }
  applyFilterClasses();
}

// --- 駆動 ---
function fullRender(now) {
  const slots = buildSlots(now, HORIZON_MS);
  renderCurrent(now);
  renderNextEach(now);
  renderLegend(slots);
  renderDayNav(slots);
  renderSchedule(slots);
}

function tick() {
  const now = Date.now();
  renderCountdown(now);
  const cur = slotForTime(now);
  if (window.__lastSlotIdx !== cur.idx) {
    window.__lastSlotIdx = cur.idx;
    fullRender(now);
  } else {
    // 1分ごとに「次の各マップ」のカウントダウンも更新
    if (Date.now() - (window.__lastNextEachUpdate || 0) > 30000) {
      window.__lastNextEachUpdate = Date.now();
      renderNextEach(now);
    }
  }
}

// 初期化
(function init() {
  const now = Date.now();
  window.__lastSlotIdx = slotForTime(now).idx;
  window.__lastNextEachUpdate = Date.now();
  fullRender(now);
  renderCountdown(now);

  // フィルタリセットボタン
  document.getElementById("filter-reset").addEventListener("click", () => {
    activeFilter = new Set(MAPS.map(m => m.id));
    saveFilter();
    const slots = buildSlots(Date.now(), HORIZON_MS);
    renderLegend(slots);
    applyFilterClasses();
  });

  // シェアボタン
  document.getElementById("share-x").addEventListener("click", shareToX);
  document.getElementById("share-copy").addEventListener("click", (e) => copyURL(e.currentTarget));

  setInterval(tick, 1000);
})();
