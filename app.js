// Apex マップローテーション計算 & 表示
// 規則: 4時間30分ごとに ブロークンムーン → キングスキャニオン → オリンパス の順でループ
// 起点: 2026-05-11 17:00 JST = ブロークンムーン（提示された表より）

// --- 定数 ---
const ANCHOR_UTC = Date.UTC(2026, 4, 11, 8, 0, 0); // 2026-05-11 17:00 JST = 08:00 UTC
const SLOT_MS = 4.5 * 60 * 60 * 1000;              // 4時間30分

const MAPS = [
  { id: "broken_moon",  name: "ブロークンムーン",   image: "images/broken_moon.jpg" },
  { id: "kings_canyon", name: "キングスキャニオン", image: "images/kings_canyon.jpg" },
  { id: "olympus",      name: "オリンパス",         image: "images/olympus.jpg" },
];

const WEEKDAY_JP = ["日", "月", "火", "水", "木", "金", "土"];

// --- スロット計算 ---
function slotForTime(t) {
  const idx = Math.floor((t - ANCHOR_UTC) / SLOT_MS);
  const start = ANCHOR_UTC + idx * SLOT_MS;
  const end = start + SLOT_MS;
  const map = MAPS[((idx % MAPS.length) + MAPS.length) % MAPS.length];
  return { idx, start, end, map };
}

function nextSlot(slot) {
  const start = slot.end;
  const end = start + SLOT_MS;
  const idx = slot.idx + 1;
  const map = MAPS[((idx % MAPS.length) + MAPS.length) % MAPS.length];
  return { idx, start, end, map };
}

// --- JST 表示用ヘルパー ---
function jstParts(ms) {
  // Asia/Tokyo の年月日時分曜日を取得
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
  // 「24:00」表記の補正（Intlは "24" を返さないので不要）
  return {
    year: parseInt(parts.year, 10),
    month: parseInt(parts.month, 10),
    day: parseInt(parts.day, 10),
    hour: parseInt(parts.hour, 10) % 24,
    minute: parseInt(parts.minute, 10),
    second: parseInt(parts.second, 10),
    weekday: parts.weekday, // "月" など
  };
}

function fmtTime(ms) {
  const p = jstParts(ms);
  return `${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`;
}

function fmtDayKey(ms) {
  const p = jstParts(ms);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
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
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

// --- レンダリング ---
function renderCurrent(now) {
  const cur = slotForTime(now);
  const nxt = nextSlot(cur);

  const card = document.getElementById("current-card");
  // マップ別クラス切り替え
  card.classList.remove("map-broken_moon", "map-kings_canyon", "map-olympus");
  card.classList.add(`map-${cur.map.id}`);

  document.getElementById("current-image").style.backgroundImage = `url("${cur.map.image}")`;
  document.getElementById("current-name").textContent = cur.map.name;
  document.getElementById("current-time").textContent =
    `${fmtTime(cur.start)} 〜 ${fmtTime(cur.end)} (JST)`;
  document.getElementById("next-name").textContent = nxt.map.name;
}

function renderCountdown(now) {
  const cur = slotForTime(now);
  document.getElementById("countdown").textContent = fmtCountdown(cur.end - now);
}

function renderSchedule(now) {
  const horizon = now + 72 * 60 * 60 * 1000; // 3日後まで
  const startSlot = slotForTime(now);
  const slots = [];
  let s = startSlot;
  // 現在スロットを含み、開始時刻が horizon を超えるまで
  while (s.start < horizon) {
    slots.push(s);
    s = nextSlot(s);
  }

  // 日付ごとにグループ化（JSTの日付で）
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
}

// --- 駆動 ---
function tick() {
  const now = Date.now();
  renderCountdown(now);
  // スロットが切り替わったタイミングで全体を再描画
  const cur = slotForTime(now);
  if (window.__lastSlotIdx !== cur.idx) {
    window.__lastSlotIdx = cur.idx;
    renderCurrent(now);
    renderSchedule(now);
  }
}

// 初回描画
(function init() {
  const now = Date.now();
  window.__lastSlotIdx = slotForTime(now).idx;
  renderCurrent(now);
  renderSchedule(now);
  renderCountdown(now);
  // カウントダウンは毎秒
  setInterval(tick, 1000);
})();
