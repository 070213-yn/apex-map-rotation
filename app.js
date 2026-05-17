// Apex マップローテーション計算 & 表示 + ゲーミングHUDエフェクト
// 規則: 4時間30分ごとに ブロークンムーン → キングスキャニオン → オリンパス の順でループ
// 起点: 2026-05-11 17:00 JST = ブロークンムーン

(function () {
  "use strict";

  // --- 定数 ---
  const ANCHOR_UTC = Date.UTC(2026, 4, 11, 8, 0, 0); // 2026-05-11 17:00 JST = 08:00 UTC
  const SLOT_MS = 4.5 * 60 * 60 * 1000;
  const HORIZON_MS = 7 * 24 * 60 * 60 * 1000;       // 1週間
  const FILTER_KEY = "apex_map_filter_v1";

  const IMG_VER = "s29c"; // 画像差し替え時にここを変えるとキャッシュバスト
  const MAPS = [
    { id: "broken_moon",  name: "Broken Moon",   image: `images/broken_moon.jpg?v=${IMG_VER}` },
    { id: "kings_canyon", name: "Kings Canyon",  image: `images/kings_canyon.jpg?v=${IMG_VER}` },
    { id: "olympus",      name: "Olympus",       image: `images/olympus.jpg?v=${IMG_VER}` },
  ];

  // モーション抑制ユーザー判定
  const REDUCE_MOTION = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

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

  // ===== レンダリング =====
  function renderCurrent(now) {
    const cur = slotForTime(now);
    const nxt = nextSlot(cur);

    const card = document.getElementById("current-card");
    card.classList.remove("map-broken_moon", "map-kings_canyon", "map-olympus");
    card.classList.add(`map-${cur.map.id}`);

    const imgEl = document.getElementById("current-image");
    const newImgUrl = `url("${cur.map.image}")`;
    if (imgEl.style.backgroundImage !== newImgUrl) {
      imgEl.style.backgroundImage = newImgUrl;
      restartKenBurns(imgEl);
    }

    document.getElementById("current-name").textContent = cur.map.name;
    document.getElementById("current-time").textContent =
      `${fmtTime(cur.start)} 〜 ${fmtTime(cur.end)} (JST)`;
    document.getElementById("next-name").textContent = nxt.map.name;

    // タブタイトルとファビコン
    document.title = `${cur.map.name} | Apex ローテ早見表`;
    updateFavicon(cur.map.id);
  }

  // Ken Burns を最初から再生し直す（画像変更時）
  function restartKenBurns(el) {
    if (!el) return;
    const prev = el.style.animation;
    el.style.animation = "none";
    // reflow 強制
    // eslint-disable-next-line no-unused-expressions
    void el.offsetWidth;
    el.style.animation = "";
    // クラスベース再開のフォールバック（CSS側がclass駆動の場合）
    el.classList.remove("kb-anim");
    void el.offsetWidth;
    el.classList.add("kb-anim");
  }

  // ===== 動的ファビコン (現在マップの色で生成) =====
  function updateFavicon(mapId) {
    const colors = {
      broken_moon: "#5dd8ff",
      kings_canyon: "#ff6b3d",
      olympus: "#c77dff",
    };
    const letters = {
      broken_moon: "B",
      kings_canyon: "K",
      olympus: "O",
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

  // 進行度バー: 現在スロットの経過率を %で反映
  function renderProgress(now) {
    const bar = document.getElementById("progress-bar");
    if (!bar) return;
    const cur = slotForTime(now);
    const ratio = Math.min(1, Math.max(0, (now - cur.start) / SLOT_MS));
    bar.style.width = (ratio * 100).toFixed(3) + "%";
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

      item.addEventListener("click", (e) => {
        spawnRipple(e, item);
        if (activeFilter.has(m.id)) {
          activeFilter.delete(m.id); // 最後の1つもOFFにできる
        } else {
          activeFilter.add(m.id);
        }
        saveFilter();
        renderLegend(slots);
        applyFilterClasses();
      });

      // 凡例ボタンにもリップル付与
      attachRipple(item);

      legend.appendChild(item);
    }
  }

  function applyFilterClasses() {
    // 全選択 = 絞り込みなし扱い。全OFFは「全部薄く」表示
    // ただし現在LIVEのスロットはフィルタの影響を受けず常に明るく表示
    const allSelected = activeFilter.size === MAPS.length;
    document.querySelectorAll(".slot").forEach(el => {
      const id = el.dataset.mapId;
      const isNow = el.classList.contains("now");
      if (isNow || allSelected || activeFilter.has(id)) {
        el.classList.remove("filtered-out");
      } else {
        el.classList.add("filtered-out");
      }
    });
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
        el.style.backgroundImage = `url("${slot.map.image}")`;
        if (slot.idx === startSlot.idx) el.classList.add("now");

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
    renderSchedule(slots);
    renderProgress(now);
  }

  // ===== エフェクト群 =====

  // 1. 画面フラッシュ（スロット切替時）
  function flashTransition() {
    if (REDUCE_MOTION) return;
    const el = document.getElementById("screen-flash");
    if (!el) return;
    el.classList.remove("active");
    // reflowで再アニメーション
    void el.offsetWidth;
    el.classList.add("active");
    setTimeout(() => {
      el.classList.remove("active");
    }, 400);
  }

  // 2. リップルエフェクト
  function spawnRipple(e, el) {
    if (REDUCE_MOTION) return;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    // 親要素のpositionがstaticの場合は相対化（CSSで対応想定だが保険）
    const cs = getComputedStyle(el);
    if (cs.position === "static") el.style.position = "relative";
    const ripple = document.createElement("span");
    ripple.className = "ripple";
    const x = (e.clientX != null ? e.clientX : rect.left + rect.width / 2) - rect.left;
    const y = (e.clientY != null ? e.clientY : rect.top + rect.height / 2) - rect.top;
    ripple.style.left = x + "px";
    ripple.style.top = y + "px";
    el.appendChild(ripple);
    setTimeout(() => {
      if (ripple.parentNode) ripple.parentNode.removeChild(ripple);
    }, 600);
  }

  function attachRipple(el) {
    if (!el || el.__rippleAttached) return;
    el.__rippleAttached = true;
    el.addEventListener("click", (e) => spawnRipple(e, el));
  }

  // 3. 背景パーティクル (canvas)
  function initParticles() {
    if (REDUCE_MOTION) return;
    const canvas = document.getElementById("particle-canvas");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    let width = 0, height = 0;
    let particles = [];

    const COLORS = [
      [255, 70, 85],   // accent
      [255, 176, 0],   // accent-2
      [93, 216, 255],  // broken_moon
    ];

    function pickColor() {
      return COLORS[Math.floor(Math.random() * COLORS.length)];
    }

    function makeParticle(initialY) {
      const color = pickColor();
      return {
        x: Math.random() * width,
        y: initialY != null ? initialY : height + Math.random() * 40,
        r: 0.5 + Math.random() * 1.5,
        a: 0.2 + Math.random() * 0.5,
        vy: -(0.15 + Math.random() * 0.55),
        vx: (Math.random() - 0.5) * 0.15,
        sway: Math.random() * Math.PI * 2,
        swaySpeed: 0.005 + Math.random() * 0.012,
        swayAmp: 0.2 + Math.random() * 0.5,
        color,
      };
    }

    function resize() {
      width = window.innerWidth;
      height = window.innerHeight;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = width + "px";
      canvas.style.height = height + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // 画面サイズに応じて粒子数を調整 (50〜80)
      const area = width * height;
      const baseCount = Math.round(Math.min(80, Math.max(50, area / 24000)));
      if (particles.length === 0) {
        particles = Array.from({ length: baseCount }, () =>
          makeParticle(Math.random() * height)
        );
      } else if (particles.length < baseCount) {
        for (let i = particles.length; i < baseCount; i++) {
          particles.push(makeParticle(Math.random() * height));
        }
      } else if (particles.length > baseCount) {
        particles.length = baseCount;
      }
    }

    function step() {
      ctx.clearRect(0, 0, width, height);
      for (const p of particles) {
        p.sway += p.swaySpeed;
        p.x += p.vx + Math.sin(p.sway) * p.swayAmp * 0.05;
        p.y += p.vy;

        if (p.y < -10 || p.x < -10 || p.x > width + 10) {
          // 下から再生成
          const fresh = makeParticle(height + Math.random() * 20);
          Object.assign(p, fresh);
        }

        const [r, g, b] = p.color;
        ctx.beginPath();
        ctx.fillStyle = `rgba(${r},${g},${b},${p.a})`;
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();

        // ほのかなグロー（ハロー）
        ctx.beginPath();
        ctx.fillStyle = `rgba(${r},${g},${b},${p.a * 0.18})`;
        ctx.arc(p.x, p.y, p.r * 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
      requestAnimationFrame(step);
    }

    resize();
    window.addEventListener("resize", resize, { passive: true });
    requestAnimationFrame(step);
  }

  // ===== tick (1秒ごと) =====
  function tick() {
    const now = Date.now();
    renderCountdown(now);
    renderProgress(now);
    const cur = slotForTime(now);
    if (window.__lastSlotIdx !== cur.idx) {
      window.__lastSlotIdx = cur.idx;
      // スロット切替: フラッシュ → 全体再描画
      flashTransition();
      fullRender(now);
    } else {
      // 30秒ごとに「次の各マップ」のカウントダウンも更新
      if (Date.now() - (window.__lastNextEachUpdate || 0) > 30000) {
        window.__lastNextEachUpdate = Date.now();
        renderNextEach(now);
      }
    }
  }

  // 初期化
  function init() {
    const now = Date.now();
    window.__lastSlotIdx = slotForTime(now).idx;
    window.__lastNextEachUpdate = Date.now();
    fullRender(now);
    renderCountdown(now);
    renderProgress(now);

    // フィルタリセットボタン
    const resetBtn = document.getElementById("filter-reset");
    if (resetBtn) {
      resetBtn.addEventListener("click", (e) => {
        spawnRipple(e, resetBtn);
        activeFilter = new Set(MAPS.map(m => m.id));
        saveFilter();
        const slots = buildSlots(Date.now(), HORIZON_MS);
        renderLegend(slots);
        applyFilterClasses();
      });
      attachRipple(resetBtn);
    }

    // シェアボタン
    const shareX = document.getElementById("share-x");
    if (shareX) {
      shareX.addEventListener("click", (e) => {
        spawnRipple(e, shareX);
        shareToX();
      });
      attachRipple(shareX);
    }

    const shareCopy = document.getElementById("share-copy");
    if (shareCopy) {
      shareCopy.addEventListener("click", (e) => {
        spawnRipple(e, shareCopy);
        copyURL(shareCopy);
      });
      attachRipple(shareCopy);
    }

    // 背景パーティクル起動
    initParticles();

    setInterval(tick, 1000);
  }

  // DOM準備を待つ
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
