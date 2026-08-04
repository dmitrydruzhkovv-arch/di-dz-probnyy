/* ДЗ «Пробный урок · Зависимость и фора» (y=x+c — фора, без общего наклона).
   Формат: ОДНА КАРТОЧКА НА ЭКРАН, движение только вперёд.
   Данные: data.json (Методист). Математику не менять — только интерфейс и проверка.
   Движок общий с домашками спринта «Графики» (dz_graf_urok1) — переиспользован каркас
   и библиотека механик, контент под пробный урок свой.
   Бум-эффект: вспышки фона-ромбов (.lk-flash-*) + звуки из бренд-кита по URL. */

'use strict';

// ── УТИЛИТЫ ──────────────────────────────────────────────────────────────────

function makeFrac(n, d) {
  return `<span class="frac lk-mono"><span class="fn">${n}</span><span class="fd">${d}</span></span>`;
}

// Мини-маркап Методиста: **акцент**→.lk-hl, `моно`→.lk-mono, 1/2 и −1/2 → двухэтажная дробь.
function fmtInline(text) {
  if (text == null) return '';
  return String(text)
    .replace(/\*\*(.+?)\*\*/g, (_, s) => `<span class="lk-hl">${s}</span>`)
    .replace(/`([^`]+)`/g,     (_, s) => `<span class="lk-mono">${s}</span>`)
    .replace(/([−-]?\d+)\/(\d+)/g, (_, n, d) => makeFrac(n, d));
}

// Текст кнопки-варианта: тот же маркап, но БЕЗ фиолет-акцента (.lk-hl запрещён в вариантах).
function fmtOpt(text) { return fmtInline(String(text).replace(/\*\*(.+?)\*\*/g, '$1')); }

function renderFeedback(fb) {
  const parts = Array.isArray(fb) ? fb : String(fb).split('\n');
  return parts.map(p => p.trim()).filter(Boolean)
    .map(p => `<p class="fb-p">${fmtInline(p)}</p>`).join('');
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

// Ввод числа: терпим − (U+2212), запятую-десятичную, пробелы.
function parseNum(s) {
  s = String(s).trim().replace(/\s/g, '').replace(/−/g, '-').replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  return parseFloat(s);
}
function fmtNum(v) { return String(v).replace('-', '−'); }

// Значение ползунка: половинки как «−0,5», знак минуса — типографский.
function fmtSliderVal(v) {
  const s = Math.round(v * 10) / 10;
  let str = Number.isInteger(s) ? String(s) : s.toFixed(1);
  return str.replace('.', ',').replace('-', '−');
}
// Коэффициент в живой формуле: половинки настоящей дробью (1/2, 3/2), целые — числом.
function fracOrInt(v) {
  const neg = v < 0, av = Math.abs(v);
  if (Number.isInteger(av)) return (neg ? '−' : '') + av;
  const num = Math.round(av * 2);   // знаменатель 2
  return (neg ? '−' : '') + makeFrac(num, 2);
}

const KEYS = ['А', 'Б', 'В', 'Г', 'Д'];
const MG_COLORS = ['mp-pair-0', 'mp-pair-1', 'mp-pair-2', 'mp-pair-3'];

// ── БУМ-ЭФФЕКТ: вспышки + звук ───────────────────────────────────────────────

function lkFlash(el) { if (!el) return; el.classList.remove('is-on'); void el.offsetWidth; el.classList.add('is-on'); }
function playSound(id) {
  const a = document.getElementById(id);
  if (!a) return;
  try { a.currentTime = 0; a.play().catch(() => {}); } catch (e) {}
}
function boom(correct) {
  if (correct) { lkFlash(document.getElementById('lk-fx-ok')); playSound('snd-win'); }
  else         { lkFlash(document.getElementById('lk-fx-bad')); playSound('snd-lose'); }
}
function cardReact(card, correct) {
  card.classList.remove('lk-card-win', 'lk-card-shake'); void card.offsetWidth;
  card.classList.add(correct ? 'lk-card-win' : 'lk-card-shake');
}
function shake(btn) {
  btn.classList.remove('shake'); void btn.offsetWidth; btn.classList.add('shake');
  btn.addEventListener('animationend', () => btn.classList.remove('shake'), { once: true });
}

// ═══════════ КООРДИНАТНАЯ ПЛОСКОСТЬ (SVG) ═══════════
// Единая геометрия: x,y ∈ [−6; 6], светлая клетка (как на печатных карточках).

const GV = { min: -6, max: 6, size: 312, pad: 16 };
GV.span = GV.max - GV.min;
GV.plot = GV.size - 2 * GV.pad;
GV.unit = GV.plot / GV.span;
function GX(x) { return GV.pad + (x - GV.min) * GV.unit; }
function GY(y) { return GV.pad + (GV.max - y) * GV.unit; }

const C_INK = '#eef0ff', C_MUTED = '#9aa0c8', C_STAR = '#D946EF', C_OK = '#34D399';
const C_LINE = '#6366F1', C_GHOST = '#cfc7ee', MONO = "'JetBrains Mono',monospace";

let SVGN = 0;

function svgDefs(id) {
  return `<defs>` +
    `<clipPath id="clip-${id}"><rect x="${GV.pad}" y="${GV.pad}" width="${GV.plot}" height="${GV.plot}" rx="10"/></clipPath>` +
    `<filter id="glow-${id}" x="-40%" y="-40%" width="180%" height="180%">` +
      `<feGaussianBlur stdDeviation="2.3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>` +
    `</filter></defs>`;
}

function gridMarkup(minimal) {
  const x0 = GV.pad, y0 = GV.pad, W = GV.plot;
  let s = `<rect x="${x0}" y="${y0}" width="${W}" height="${W}" rx="10" fill="rgba(255,255,255,.028)" stroke="#2a2a4d" stroke-width="1"/>`;
  const grid = minimal ? 'rgba(255,255,255,.055)' : 'rgba(255,255,255,.075)';
  for (let i = GV.min; i <= GV.max; i++) {
    if (i === 0) continue;
    const gx = GX(i).toFixed(1), gy = GY(i).toFixed(1);
    s += `<line x1="${gx}" y1="${y0}" x2="${gx}" y2="${y0 + W}" stroke="${grid}" stroke-width="1"/>`;
    s += `<line x1="${x0}" y1="${gy}" x2="${x0 + W}" y2="${gy}" stroke="${grid}" stroke-width="1"/>`;
  }
  const ax = GX(0), ay = GY(0), axCol = 'rgba(255,255,255,.42)';
  s += `<line x1="${x0}" y1="${ay}" x2="${x0 + W}" y2="${ay}" stroke="${axCol}" stroke-width="1.6"/>`;
  s += `<line x1="${ax}" y1="${y0}" x2="${ax}" y2="${y0 + W}" stroke="${axCol}" stroke-width="1.6"/>`;
  s += `<path d="M${x0 + W},${ay} l-7,-4 l0,8 z" fill="${axCol}"/>`;
  s += `<path d="M${ax},${y0} l-4,7 l8,0 z" fill="${axCol}"/>`;
  if (!minimal) {
    s += `<text x="${x0 + W - 3}" y="${ay - 7}" fill="${C_MUTED}" font-size="12" font-family="${MONO}" text-anchor="end">x</text>`;
    s += `<text x="${ax + 8}" y="${y0 + 12}" fill="${C_MUTED}" font-size="12" font-family="${MONO}">y</text>`;
    s += `<text x="${ax - 6}" y="${ay + 14}" fill="${C_MUTED}" font-size="11" font-family="${MONO}" text-anchor="end">O</text>`;
    [-4, -2, 2, 4].forEach(n => {
      s += `<text x="${GX(n).toFixed(1)}" y="${ay + 15}" fill="${C_MUTED}" font-size="9.5" font-family="${MONO}" text-anchor="middle" opacity=".65">${fmtNum(n)}</text>`;
      s += `<text x="${ax - 7}" y="${(GY(n) + 3.5).toFixed(1)}" fill="${C_MUTED}" font-size="9.5" font-family="${MONO}" text-anchor="end" opacity=".65">${fmtNum(n)}</text>`;
    });
  }
  return s;
}

function starPath(cx, cy, r) {
  let p = ''; const spikes = 5, inner = r * 0.44;
  for (let i = 0; i < spikes * 2; i++) {
    const rad = (i % 2 === 0) ? r : inner;
    const ang = (Math.PI / spikes) * i - Math.PI / 2;
    p += (i === 0 ? 'M' : 'L') + (cx + Math.cos(ang) * rad).toFixed(1) + ',' + (cy + Math.sin(ang) * rad).toFixed(1);
  }
  return p + 'Z';
}

function lineAttrs(k, b) {
  const y1 = k * GV.min + b, y2 = k * GV.max + b;
  return { x1: GX(GV.min).toFixed(1), y1: GY(y1).toFixed(1), x2: GX(GV.max).toFixed(1), y2: GY(y2).toFixed(1) };
}
function absPoints(a, c, flip) {
  const f = x => flip ? c - Math.abs(x - a) : c + Math.abs(x - a);
  return [GV.min, a, GV.max].map(x => `${GX(x).toFixed(1)},${GY(f(x)).toFixed(1)}`).join(' ');
}

// Статичный график (для «прочитай прямую», плиток «соедини», точки).
function buildGraph(opts) {
  const id = ++SVGN, min = !!opts.minimal;
  let inner = svgDefs(id) + gridMarkup(min);
  inner += `<g clip-path="url(#clip-${id})">`;
  (opts.lines || []).forEach(l => {
    const a = lineAttrs(l.k, l.b);
    inner += `<line x1="${a.x1}" y1="${a.y1}" x2="${a.x2}" y2="${a.y2}" stroke="${l.color || C_LINE}" stroke-width="${min ? 3 : 3.4}" stroke-linecap="round" filter="url(#glow-${id})"/>`;
  });
  inner += `</g>`;
  (opts.stars || []).forEach(st => {
    inner += `<path d="${starPath(GX(st.x), GY(st.y), 9)}" fill="${st.on ? C_OK : C_STAR}" stroke="#0A0610" stroke-width="1" filter="url(#glow-${id})"/>`;
  });
  (opts.points || []).forEach(p => {
    const cx = GX(p.x), cy = GY(p.y);
    inner += `<path d="M${cx},${GY(0)} L${cx},${cy}" stroke="rgba(168,85,247,.4)" stroke-width="1.2" stroke-dasharray="3 3"/>`;
    inner += `<path d="M${GX(0)},${cy} L${cx},${cy}" stroke="rgba(168,85,247,.4)" stroke-width="1.2" stroke-dasharray="3 3"/>`;
    inner += `<circle cx="${cx}" cy="${cy}" r="6" fill="#A855F7" stroke="#fff" stroke-width="1.5" filter="url(#glow-${id})"/>`;
  });
  const cls = 'graph-svg' + (opts.sizeClass ? (' ' + opts.sizeClass) : '');
  return `<div class="graph-wrap"><svg class="${cls}" viewBox="0 0 ${GV.size} ${GV.size}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="координатная плоскость">${inner}</svg></div>`;
}

// ═══════════ ДВИЖОК ЖИВОГО ГРАФИКА (переиспользуемый) ═══════════
// cfg.line: { mode:'line', stars:[{x,y}], target:{k,b}, frozen?:{k|b}, winStars?:[...] }
// cfg.abs:  { mode:'abs',  rounds:[{a,c,flip}], roundHints:[...] }
// onWin() — вызывается один раз, когда шаг (последний раунд) пойман.

function createEngine(host, cfg, onWin) {
  const id = ++SVGN;
  const isAbs = cfg.mode === 'abs';
  const targets = isAbs ? cfg.rounds : [cfg.target];
  const st = isAbs
    ? { a: 0, c: 0, flip: false }
    : { k: (cfg.frozen && 'k' in cfg.frozen) ? cfg.frozen.k : 0,
        b: (cfg.frozen && 'b' in cfg.frozen) ? cfg.frozen.b : 0 };
  let roundIdx = 0, won = false, advancing = false;
  let lastMoved = isAbs ? 'c' : ((cfg.frozen && 'k' in cfg.frozen) ? 'b' : 'k');

  // ── разметка движка ──
  const tag = isAbs ? 'polyline' : 'line';
  // валидные заглушки геометрии (redraw перезапишет сразу) — иначе SVG ругается на пустую длину
  const emptyGeom = isAbs ? 'points="0,0"' : 'x1="0" y1="0" x2="0" y2="0"';
  const svg =
    `<svg class="graph-svg" viewBox="0 0 ${GV.size} ${GV.size}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="живой график">` +
      svgDefs(id) + gridMarkup(false) +
      `<g clip-path="url(#clip-${id})">` +
        `<${tag} id="ge-ghost-${id}" ${emptyGeom} fill="none" stroke="${C_GHOST}" stroke-width="2" stroke-dasharray="5 5" stroke-linecap="round" stroke-linejoin="round" opacity=".34"/>` +
        `<${tag} id="ge-line-${id}" ${emptyGeom} fill="none" stroke="${C_LINE}" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round" filter="url(#glow-${id})"/>` +
      `</g>` +
      `<g id="ge-stars-${id}"></g>` +
    `</svg>`;

  host.innerHTML =
    `<div class="ge">` +
      `<div class="ge-round" id="ge-round-${id}"></div>` +
      `<div class="ge-formula" id="ge-formula-${id}"></div>` +
      `<div class="graph-wrap">${svg}</div>` +
      `<div class="ge-hint" id="ge-hint-${id}"></div>` +
      `<div class="ge-sliders" id="ge-sliders-${id}"></div>` +
    `</div>`;

  const lineEl    = host.querySelector(`#ge-line-${id}`);
  const ghostEl   = host.querySelector(`#ge-ghost-${id}`);
  const starsG    = host.querySelector(`#ge-stars-${id}`);
  const formulaEl = host.querySelector(`#ge-formula-${id}`);
  const roundEl   = host.querySelector(`#ge-round-${id}`);
  const hintEl    = host.querySelector(`#ge-hint-${id}`);
  const sliders   = host.querySelector(`#ge-sliders-${id}`);

  // ── формулы ──
  function lineFormula(k, b, hl) {
    const kPart = `<span class="${hl === 'k' ? 'lk-hl' : ''}">${fracOrInt(k)}</span>·x`;
    const sign = b < 0 ? '−' : '+';
    const bPart = `${sign} <span class="${hl === 'b' ? 'lk-hl' : ''}">${Math.abs(b)}</span>`;
    return `y = ${kPart} ${bPart}`;
  }
  function absFormula(a, c, flip, hl) {
    const flipMark = `<span class="${hl === 'flip' ? 'lk-hl' : ''}">${flip ? '−' : ''}</span>`;
    let inside = 'x';
    if (a > 0) inside = `x − <span class="${hl === 'a' ? 'lk-hl' : ''}">${a}</span>`;
    else if (a < 0) inside = `x + <span class="${hl === 'a' ? 'lk-hl' : ''}">${Math.abs(a)}</span>`;
    let cPart = '';
    if (c > 0) cPart = ` + <span class="${hl === 'c' ? 'lk-hl' : ''}">${c}</span>`;
    else if (c < 0) cPart = ` − <span class="${hl === 'c' ? 'lk-hl' : ''}">${Math.abs(c)}</span>`;
    return `y = ${flipMark}|${inside}|${cPart}`;
  }

  // ── звёзды (только режим line) ──
  function renderStars() {
    if (isAbs || !cfg.stars) return;
    starsG.innerHTML = cfg.stars.map(s =>
      `<path d="${starPath(GX(s.x), GY(s.y), 9)}" fill="${C_STAR}" stroke="#0A0610" stroke-width="1" filter="url(#glow-${id})"/>`).join('');
  }
  function updateStars() {
    if (isAbs || !cfg.stars) return;
    cfg.stars.forEach((s, i) => {
      const el = starsG.children[i]; if (!el) return;
      const on = Math.abs(st.k * s.x + st.b - s.y) <= 0.15;
      el.setAttribute('fill', on ? C_OK : C_STAR);
    });
  }

  // ── призрак-цель ──
  function setGhost() {
    const t = targets[roundIdx];
    if (isAbs) ghostEl.setAttribute('points', absPoints(t.a, t.c, t.flip));
    else { const a = lineAttrs(t.k, t.b); ghostEl.setAttribute('x1', a.x1); ghostEl.setAttribute('y1', a.y1); ghostEl.setAttribute('x2', a.x2); ghostEl.setAttribute('y2', a.y2); }
  }

  function hit() {
    if (isAbs) { const t = targets[roundIdx]; return st.a === t.a && st.c === t.c && !!st.flip === !!t.flip; }
    const idxs = cfg.winStars || cfg.stars.map((_, i) => i);
    return idxs.every(i => { const s = cfg.stars[i]; return Math.abs(st.k * s.x + st.b - s.y) <= 0.15; });
  }

  function redraw() {
    if (isAbs) {
      lineEl.setAttribute('points', absPoints(st.a, st.c, st.flip));
      formulaEl.innerHTML = absFormula(st.a, st.c, st.flip, lastMoved);
    } else {
      const a = lineAttrs(st.k, st.b);
      lineEl.setAttribute('x1', a.x1); lineEl.setAttribute('y1', a.y1); lineEl.setAttribute('x2', a.x2); lineEl.setAttribute('y2', a.y2);
      formulaEl.innerHTML = lineFormula(st.k, st.b, lastMoved);
      updateStars();
    }
    maybeWin();
  }

  function maybeWin() {
    if (won || advancing || !hit()) return;
    boom(true);
    if (isAbs && roundIdx < targets.length - 1) {
      advancing = true;
      hintEl.className = 'ge-hint win'; hintEl.textContent = 'Есть! ✨ Следующая галочка…';
      setTimeout(() => { advancing = false; roundIdx++; loadRound(); redraw(); }, 850);
    } else {
      won = true;
      hintEl.className = 'ge-hint win'; hintEl.textContent = 'Поймал! ✨';
      onWin();
    }
  }

  function loadRound() {
    setGhost();
    if (isAbs) {
      roundEl.textContent = `Раунд ${roundIdx + 1} из ${targets.length}`;
      hintEl.className = 'ge-hint';
      hintEl.innerHTML = fmtInline((cfg.roundHints && cfg.roundHints[roundIdx]) || '');
    } else {
      roundEl.textContent = '';
      hintEl.className = 'ge-hint';
      hintEl.textContent = 'Двигай ползунок — звёзды загорятся, когда дорога пройдёт через них.';
    }
  }

  // ── ползунки ──
  function sliderRow(key, name, min, max, step) {
    return `<div class="slrow" data-key="${key}">` +
      `<span class="sl-name">${name}</span>` +
      `<button class="slbtn" data-act="dec" aria-label="меньше">−</button>` +
      `<input type="range" class="sl" min="${min}" max="${max}" step="${step}" value="${st[key]}">` +
      `<button class="slbtn" data-act="inc" aria-label="больше">+</button>` +
      `<span class="slval">${fmtSliderVal(st[key])}</span>` +
    `</div>`;
  }
  function frozenRow(name, valTxt) {
    return `<div class="slrow frozen"><span class="sl-name">${name}</span><span class="sl-frozen-tag">заморожен: ${valTxt}</span></div>`;
  }

  let slHTML = '';
  if (isAbs) {
    slHTML += sliderRow('a', '↔️ Вбок a', -3, 3, 1);
    slHTML += sliderRow('c', '🛗 Вверх c', -3, 3, 1);
    slHTML += `<button class="flip-btn" data-key="flip" type="button"><span class="fb-ico">🔀</span> <span class="flip-lbl">рожки вверх ▲</span></button>`;
  } else {
    if (cfg.frozen && 'k' in cfg.frozen) slHTML += frozenRow('🎛️ Руль k', 'k=' + fmtSliderVal(cfg.frozen.k));
    else slHTML += sliderRow('k', '🎛️ Руль k', -3, 3, 0.5);
    if (cfg.frozen && 'b' in cfg.frozen) slHTML += frozenRow('🛗 Лифт b', 'b=' + fmtSliderVal(cfg.frozen.b));
    else slHTML += sliderRow('b', '🛗 Лифт b', -5, 5, 1);
  }
  sliders.innerHTML = slHTML;

  sliders.querySelectorAll('.slrow').forEach(row => {
    const key = row.dataset.key; if (!key) return;
    const range = row.querySelector('input[type=range]');
    const valEl = row.querySelector('.slval');
    if (!range) return;
    function sync() { st[key] = +range.value; lastMoved = key; valEl.textContent = fmtSliderVal(+range.value); redraw(); }
    range.addEventListener('input', sync);
    row.querySelectorAll('.slbtn').forEach(btn => btn.addEventListener('click', () => {
      const step = +range.step || 1, dir = btn.dataset.act === 'inc' ? 1 : -1;
      range.value = clamp(Math.round((+range.value + dir * step) * 100) / 100, +range.min, +range.max);
      sync();
    }));
  });
  const flipBtn = sliders.querySelector('.flip-btn');
  if (flipBtn) flipBtn.addEventListener('click', () => {
    st.flip = !st.flip; lastMoved = 'flip';
    flipBtn.querySelector('.flip-lbl').textContent = st.flip ? 'рожки вниз ▼' : 'рожки вверх ▲';
    redraw();
  });

  // старт
  renderStars();
  loadRound();
  redraw();
}

// ═══════════ МЕХАНИКА 1 — ВЕРНО / НЕВЕРНО ═══════════

function buildTrueFalse(task) {
  return task.items.map((it, i) => `
    <div class="tf-row" id="tf-${task.id}-${i}">
      <div class="tf-text">${fmtInline(it.text)}</div>
      <div class="tf-btns">
        <button class="tf-btn" data-i="${i}" data-v="1">Верно</button>
        <button class="tf-btn" data-i="${i}" data-v="0">Неверно</button>
      </div>
    </div>`).join('');
}
function initTrueFalse(task, card) {
  const ans = {};
  card.querySelectorAll('.tf-btn').forEach(btn => btn.addEventListener('click', () => {
    if (btn.disabled) return;
    const i = btn.dataset.i; ans[i] = btn.dataset.v === '1';
    card.querySelectorAll(`.tf-btn[data-i="${i}"]`).forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
  }));
  return { check() {
    if (!task.items.every((_, i) => ans[i] !== undefined)) return { ok: false };
    let allC = true; const wrong = [];
    task.items.forEach((it, i) => {
      const ok = ans[i] === it.ans;
      if (!ok) { allC = false; wrong.push(`${fmtInline(it.text)} → верно: **${it.ans ? 'Верно' : 'Неверно'}**`); }
      card.querySelector(`#tf-${task.id}-${i}`).classList.add(ok ? 'is-correct' : 'is-wrong');
      card.querySelectorAll(`.tf-btn[data-i="${i}"]`).forEach(b => {
        b.classList.remove('selected');
        const bv = b.dataset.v === '1';
        if (bv === it.ans) b.classList.add('is-correct');
        else if (bv === ans[i]) b.classList.add('is-wrong');
        b.disabled = true;
      });
    });
    return { ok: true, correct: allC, wrong };
  }};
}

// ═══════════ МЕХАНИКА 2 — ПРОЧИТАЙ ПРЯМУЮ ═══════════

function buildReadLine(task) {
  return task.items.map((it, i) => `
    <div class="rl-item" id="rl-${task.id}-${i}">
      ${buildGraph({ lines: [{ k: it.k, b: it.b }] })}
      <div class="rl-controls">
        <div class="rl-grp">
          <span class="rl-grp-lbl">знак <span class="lk-mono">k</span>:</span>
          <button class="sign-btn" data-i="${i}" data-s="pos">&gt;0</button>
          <button class="sign-btn" data-i="${i}" data-s="neg">&lt;0</button>
        </div>
        <div class="rl-grp">
          <span class="rl-grp-lbl"><span class="lk-mono">b</span> =</span>
          <input class="num-field" type="text" inputmode="text" autocomplete="off" id="rl-b-${task.id}-${i}" placeholder="?">
        </div>
      </div>
    </div>`).join('');
}
function initReadLine(task, card) {
  const sign = {};
  card.querySelectorAll('.sign-btn').forEach(btn => btn.addEventListener('click', () => {
    if (btn.disabled) return;
    const i = btn.dataset.i; sign[i] = btn.dataset.s;
    card.querySelectorAll(`.sign-btn[data-i="${i}"]`).forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
  }));
  return { check() {
    for (let i = 0; i < task.items.length; i++) {
      if (sign[i] === undefined) return { ok: false };
      if (parseNum(card.querySelector(`#rl-b-${task.id}-${i}`).value) === null) return { ok: false };
    }
    let allC = true; const wrong = [];
    task.items.forEach((it, i) => {
      const wantSign = it.k > 0 ? 'pos' : 'neg';
      const bVal = parseNum(card.querySelector(`#rl-b-${task.id}-${i}`).value);
      const ok = sign[i] === wantSign && bVal === it.b;
      if (!ok) { allC = false; wrong.push(`график ${i + 1}: верно \`k${wantSign === 'pos' ? '>0' : '<0'}\`, \`b=${fmtNum(it.b)}\``); }
      card.querySelector(`#rl-${task.id}-${i}`).classList.add(ok ? 'is-correct' : 'is-wrong');
      card.querySelectorAll(`.sign-btn[data-i="${i}"]`).forEach(b => {
        b.classList.remove('selected');
        if (b.dataset.s === wantSign) b.classList.add('is-correct');
        else if (b.dataset.s === sign[i]) b.classList.add('is-wrong');
        b.disabled = true;
      });
      card.querySelector(`#rl-b-${task.id}-${i}`).disabled = true;
    });
    return { ok: true, correct: allC, wrong };
  }};
}

// ═══════════ МЕХАНИКА 6 — СОЕДИНИ ФОРМУЛУ С ГРАФИКОМ ═══════════

function buildMatchGraph(task) {
  const right = task._right || (task._right = shuffle(task.pairs.map((p, i) => ({ ...p, origIdx: i }))));
  const leftCol = task.pairs.map((p, i) =>
    `<div class="mg-item formula" data-side="left" data-idx="${i}">${fmtInline('`' + p.formula + '`')}</div>`).join('');
  const rightCol = right.map(p =>
    `<div class="mg-item graph" data-side="right" data-orig="${p.origIdx}">${buildGraph({ lines: [{ k: p.k, b: p.b }], minimal: true, sizeClass: 'sm' })}</div>`).join('');
  return `<div class="mg-grid">
    <div class="mg-col"><div class="mg-col-label">формула</div>${leftCol}</div>
    <div class="mg-col"><div class="mg-col-label">график</div>${rightCol}</div>
  </div>`;
}
function initMatchGraph(task, card) {
  const state = { sel: null, pairs: {} };
  function setNum(el, n) {
    if (!el) return;
    let b = el.querySelector('.mg-num');
    if (n === null) { if (b) b.remove(); return; }
    if (!b) { b = document.createElement('span'); b.className = 'mg-num'; el.appendChild(b); }
    b.textContent = n;
  }
  function freeNum() { const used = new Set(Object.values(state.pairs).map(p => p.n)); let n = 1; while (used.has(n)) n++; return n; }
  function pair(li, ro) {
    Object.keys(state.pairs).forEach(k => { if (+k !== li && state.pairs[k].ro === ro) delete state.pairs[k]; });
    if (state.pairs[li]) state.pairs[li].ro = ro; else state.pairs[li] = { ro, n: freeNum() };
  }
  function apply() {
    card.querySelectorAll('.mg-item').forEach(el => { MG_COLORS.forEach(c => el.classList.remove(c)); el.classList.remove('mp-selected'); setNum(el, null); });
    Object.entries(state.pairs).forEach(([li, p]) => {
      const l = card.querySelector(`.mg-item[data-side="left"][data-idx="${li}"]`);
      const r = card.querySelector(`.mg-item[data-side="right"][data-orig="${p.ro}"]`);
      const ci = (p.n - 1) % MG_COLORS.length;
      if (l) l.classList.add(MG_COLORS[ci]); if (r) r.classList.add(MG_COLORS[ci]);
      setNum(l, p.n); setNum(r, p.n);
    });
    if (state.sel) {
      const s = state.sel.side === 'left'
        ? card.querySelector(`.mg-item[data-side="left"][data-idx="${state.sel.key}"]`)
        : card.querySelector(`.mg-item[data-side="right"][data-orig="${state.sel.key}"]`);
      if (s) s.classList.add('mp-selected');
    }
  }
  card.querySelectorAll('.mg-item').forEach(item => item.addEventListener('click', () => {
    if (item.classList.contains('is-locked')) return;
    const side = item.dataset.side;
    const key = side === 'left' ? +item.dataset.idx : +item.dataset.orig;
    if (state.sel && state.sel.side === side && state.sel.key === key) state.sel = null;
    else if (!state.sel || state.sel.side === side) state.sel = { side, key };
    else { const li = side === 'left' ? key : state.sel.key; const ro = side === 'right' ? key : state.sel.key; pair(li, ro); state.sel = null; }
    apply();
  }));
  return { check() {
    if (!task.pairs.every((_, i) => state.pairs[i] !== undefined)) return { ok: false };
    let allC = true; const wrong = [];
    task.pairs.forEach((p, li) => {
      const ro = state.pairs[li].ro, ok = ro === li;
      if (!ok) { allC = false; wrong.push(`${fmtInline('`' + p.formula + '`')} → не с той линией`); }
      const l = card.querySelector(`.mg-item[data-side="left"][data-idx="${li}"]`);
      const r = card.querySelector(`.mg-item[data-side="right"][data-orig="${ro}"]`);
      MG_COLORS.forEach(c => { if (l) l.classList.remove(c); if (r) r.classList.remove(c); });
      if (l) { l.classList.remove('mp-selected'); l.classList.add(ok ? 'is-correct' : 'is-wrong', 'is-locked'); }
      if (r) r.classList.add(ok ? 'is-correct' : 'is-wrong', 'is-locked');
    });
    card.querySelectorAll('.mg-item[data-side="right"]').forEach(el => el.classList.add('is-locked'));
    return { ok: true, correct: allC, wrong };
  }};
}

// ═══════════ МЕХАНИКА 7 — ОДИНОЧНЫЙ ВЫБОР ═══════════

function buildSingleChoice(task) {
  const shown = task._shown || (task._shown = shuffle(task.options.map((o, i) => ({ ...o, _i: i }))));
  const q = task.quote ? `<div class="sc-quote">${fmtInline(task.quote)}</div>` : '';
  const opts = shown.map((o, i) =>
    `<button class="lk-opt" data-i="${i}"><span class="lk-key">${KEYS[i]}</span><span>${fmtOpt(o.text)}</span></button>`).join('');
  return q + `<div class="lk-opts">${opts}</div>`;
}
function initSingleChoice(task, card) {
  const shown = task._shown; let pick = null;
  card.querySelectorAll('.lk-opt').forEach(btn => btn.addEventListener('click', () => {
    if (btn.classList.contains('is-locked')) return;
    pick = +btn.dataset.i;
    card.querySelectorAll('.lk-opt').forEach(b => { b.style.borderColor = ''; b.style.background = ''; });
    btn.style.borderColor = 'var(--lk-violet)'; btn.style.background = 'rgba(168,85,247,.10)';
  }));
  return { check() {
    if (pick === null) return { ok: false };
    const ok = shown[pick].correct; const wrong = [];
    const _right = shown.find(o => o.correct);
    if (!ok) wrong.push(`ты: ${fmtInline(shown[pick].text)} · верно: ${fmtInline(_right.text)}`);
    shown.forEach((o, i) => {
      const b = card.querySelector(`.lk-opt[data-i="${i}"]`); b.style.borderColor = ''; b.style.background = '';
      if (o.correct) b.classList.add('is-correct'); else if (i === pick) b.classList.add('is-wrong');
      b.classList.add('is-locked');
    });
    return { ok: true, correct: ok, wrong,
             pick: shown[pick].text, answer: _right.text };
  }};
}

// ═══════════ МЕХАНИКА 9 — ТАРИФ ТАКСИ ═══════════

function buildTaxi(task) {
  const rows = task.assign.map((a, i) => `
    <div class="tx-assign-row" id="tx-${task.id}-${i}">
      <span class="tx-val">${a.value}</span>
      <div class="tx-opts">
        ${task.assign_options.map(o => `<button class="tx-opt" data-i="${i}" data-id="${o.id}">${fmtInline(o.text)}</button>`).join('')}
      </div>
    </div>`).join('');
  return rows + `
    <div class="tx-q">
      <div class="tx-q-text">${fmtInline(task.question)}</div>
      <div class="tx-q-input">
        <input class="num-field big-field" type="text" inputmode="text" autocomplete="off" id="tx-ans-${task.id}" placeholder="?">
        <span class="unit">${task.unit || ''}</span>
      </div>
    </div>`;
}
function initTaxi(task, card) {
  const pick = {};
  card.querySelectorAll('.tx-opt').forEach(btn => btn.addEventListener('click', () => {
    if (btn.disabled) return;
    const i = btn.dataset.i; pick[i] = btn.dataset.id;
    card.querySelectorAll(`.tx-opt[data-i="${i}"]`).forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
  }));
  return { check() {
    for (let i = 0; i < task.assign.length; i++) if (pick[i] === undefined) return { ok: false };
    const ansVal = parseNum(card.querySelector(`#tx-ans-${task.id}`).value);
    if (ansVal === null) return { ok: false };
    let allC = true; const wrong = [];
    task.assign.forEach((a, i) => {
      const ok = pick[i] === a.ans;
      if (!ok) allC = false;
      card.querySelector(`#tx-${task.id}-${i}`).classList.add(ok ? 'is-correct' : 'is-wrong');
      card.querySelectorAll(`.tx-opt[data-i="${i}"]`).forEach(b => {
        b.classList.remove('selected');
        if (b.dataset.id === a.ans) b.classList.add('is-correct');
        else if (b.dataset.id === pick[i]) b.classList.add('is-wrong');
        b.disabled = true;
      });
    });
    const numOk = Math.abs(ansVal - task.answer) < 1e-9;
    if (!numOk) { allC = false; wrong.push(`${fmtInline(task.question)} ты: ${fmtNum(ansVal)} · верно: **${task.answer} ${task.unit || ''}**`); }
    else if (!allC) wrong.push('перепутал, что такое `b` (посадка), а что `k` (цена за км)');
    const af = card.querySelector(`#tx-ans-${task.id}`); af.disabled = true;
    const q = card.querySelector('.tx-q'); q.style.borderColor = numOk ? 'rgba(52,211,153,.45)' : 'rgba(244,63,94,.45)';
    return { ok: true, correct: allC, wrong };
  }};
}

// ═══════════ МЕХАНИКА 10 — ЧИСЛОВОЙ ОТВЕТ ═══════════

function buildNumber(task) {
  return `<div class="num-row" id="num-${task.id}">
    <input class="num-field big-field" type="text" inputmode="text" autocomplete="off" id="num-in-${task.id}" placeholder="?">
    <span class="unit">${task.unit || ''}</span>
  </div>`;
}
function checkNumber(task, card) {
  const v = parseNum(card.querySelector(`#num-in-${task.id}`).value);
  if (v === null) return { ok: false };
  const ok = Math.abs(v - task.answer) < 1e-9; const wrong = [];
  if (!ok) wrong.push(`ты: ${fmtNum(v)} · верно: **${task.answer} ${task.unit || ''}**`);
  card.querySelector(`#num-${task.id}`).classList.add(ok ? 'is-correct' : 'is-wrong');
  card.querySelector(`#num-in-${task.id}`).disabled = true;
  // pick/answer — для разбора (?r=): «твой ответ» и «правильный» отдельными строками
  return { ok: true, correct: ok, wrong,
           pick: `${fmtNum(v)} ${task.unit || ''}`.trim(),
           answer: `**${task.answer} ${task.unit || ''}**`.trim() };
}

// ═══════════ МЕХАНИКА 11 — КООРДИНАТЫ ТОЧКИ ═══════════

function buildCoord(task) {
  return buildGraph({ points: [{ x: task.point.x, y: task.point.y }] }) + `
    <div class="coord-row" id="coord-${task.id}">
      <span class="paren">(</span>
      <input class="num-field" type="text" inputmode="text" autocomplete="off" id="coord-x-${task.id}" placeholder="x">
      <span class="semi">;</span>
      <input class="num-field" type="text" inputmode="text" autocomplete="off" id="coord-y-${task.id}" placeholder="y">
      <span class="paren">)</span>
    </div>`;
}
function checkCoord(task, card) {
  const x = parseNum(card.querySelector(`#coord-x-${task.id}`).value);
  const y = parseNum(card.querySelector(`#coord-y-${task.id}`).value);
  if (x === null || y === null) return { ok: false };
  const ok = x === task.point.x && y === task.point.y; const wrong = [];
  if (!ok) wrong.push(`ты: (${fmtNum(x)}; ${fmtNum(y)}) · верно: **(${fmtNum(task.point.x)}; ${fmtNum(task.point.y)})**`);
  const _pick = `(${fmtNum(x)}; ${fmtNum(y)})`, _ans = `**(${fmtNum(task.point.x)}; ${fmtNum(task.point.y)})**`;
  card.querySelector(`#coord-${task.id}`).classList.add(ok ? 'is-correct' : 'is-wrong');
  card.querySelector(`#coord-x-${task.id}`).disabled = true;
  card.querySelector(`#coord-y-${task.id}`).disabled = true;
  return { ok: true, correct: ok, wrong, pick: _pick, answer: _ans };
}

// ── РОУТЕРЫ (не-слайдерные механики) ─────────────────────────────────────────

function buildBody(task) {
  switch (task.mechanic) {
    case 'truefalse':     return buildTrueFalse(task);
    case 'read_line':     return buildReadLine(task);
    case 'match_graph':   return buildMatchGraph(task);
    case 'single_choice': return buildSingleChoice(task);
    case 'taxi':          return buildTaxi(task);
    case 'number':        return buildNumber(task);
    case 'coord':         return buildCoord(task);
    default: return '';
  }
}
function initMechanic(task, card) {
  switch (task.mechanic) {
    case 'truefalse':     return initTrueFalse(task, card);
    case 'read_line':     return initReadLine(task, card);
    case 'match_graph':   return initMatchGraph(task, card);
    case 'single_choice': return initSingleChoice(task, card);
    case 'taxi':          return initTaxi(task, card);
    case 'number':        return { check: () => checkNumber(task, card) };
    case 'coord':         return { check: () => checkCoord(task, card) };
    default: return { check: () => ({ ok: true, correct: true, wrong: [] }) };
  }
}

// ── СОСТОЯНИЕ + СОХРАНЕНИЕ ────────────────────────────────────────────────────

let DATA = null;
let idx = 0, combo = 0, firstTryCount = 0, finished = false, reported = false;
let devMode = false, allowSend = false;
let startTs = null, startPerf = null;   // начало для показа (Date) + честная длительность (performance.now)
const results = [];

function localIso(d) {
  const p = x => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}
function fmtDur(sec) {
  if (sec == null) return null;
  const m = Math.floor(sec / 60), s = sec % 60;
  return m ? `${m} мин ${s} с` : `${s} с`;
}

const HW_ID = 'dz_probnyy';
function progKey() {
  const u = (new URLSearchParams(location.search).get('u') || '').slice(0, 40);
  return `hwprog:${HW_ID}:${u}`;
}
function saveProgress() {
  if (devMode) return;
  try { localStorage.setItem(progKey(), JSON.stringify({ v: 1, results, firstTryCount, combo, finished, reported })); }
  catch (e) {}
}
function loadProgress() { try { return JSON.parse(localStorage.getItem(progKey()) || 'null'); } catch (e) { return null; } }
function clearProgress() { try { localStorage.removeItem(progKey()); } catch (e) {} }

function recordResult(task, correct, wrong, res) {
  // Снимок задания для разбора (стандарт: условие → ответ ученика → правильный → разбор).
  // pick/answer отдают сами механики; если механика их не отдала — в разборе покажутся
  // строки wrong[] («ты: 5 · верно: 7»), пусто не будет.
  results[idx] = {
    label: task.label, diff: task.difficulty, correct, wrong: wrong || [], feedback: task.feedback,
    cond: task.intro || task.cond || '',
    image: task.image || '',
    snap: HwCore.snap(document.getElementById(`body-${task.id}`)),
    pick: res && res.pick !== undefined ? res.pick : undefined,
    answer: res && res.answer !== undefined ? res.answer : undefined,
  };
  if (correct) { firstTryCount++; combo++; } else combo = 0;
  updateCombo();
  document.getElementById('prog-fill').style.width = `${((idx + 1) / DATA.tasks.length) * 100}%`;
  saveProgress();
}
function updateCombo() {
  const el = document.getElementById('combo');
  if (combo >= 2) { el.textContent = `🔥 ${combo} подряд!`; el.classList.add('show'); }
  else el.classList.remove('show');
}

// ── «ЗАНОВО» (сброс прогресса) ────────────────────────────────────────────────

function doReset() {
  clearProgress();
  const p = new URLSearchParams(location.search);
  p.set('reset', '1');                  // стартовать заново (loadProgress вернёт пусто)
  location.href = location.pathname + '?' + p.toString();
}

// Полоска «Заново» — ВНЕ карточки, внизу, через пустоту фона-ромбов. Алая.
function resetStripHtml() {
  return `<div class="reset-strip"><button class="reset-btn" type="button" data-reset>Заново</button></div>`;
}
function wireReset(root) {
  const b = root.querySelector('[data-reset]');
  if (b) b.addEventListener('click', showResetConfirm);
}

// Полноэкранное подтверждение сброса (Да / Нет).
function showResetConfirm() {
  const ov = document.getElementById('reset-overlay');
  if (ov) ov.classList.add('show');
}
function hideResetConfirm() {
  const ov = document.getElementById('reset-overlay');
  if (ov) ov.classList.remove('show');
}

// ── РЕНДЕР КАРТОЧКИ ───────────────────────────────────────────────────────────

function render() {
  if (idx >= DATA.tasks.length) return showFinal();
  if (!startTs) { startTs = new Date(); startPerf = performance.now(); }   // засекаем старт на первом задании
  const task = DATA.tasks[idx];
  const screen = document.getElementById('screen');
  document.getElementById('prog-label').textContent = `${idx + 1} из ${DATA.tasks.length}`;
  document.getElementById('prog-fill').style.width = `${(idx / DATA.tasks.length) * 100}%`;

  const isLast = idx === DATA.tasks.length - 1;
  const isSlider = task.mechanic === 'slider_line' || task.mechanic === 'slider_abs';
  const hasHint = !!(task.hint && String(task.hint).trim());
  const num = idx + 1;
  const subtitle = String(task.label || '');

  screen.innerHTML = `
    <div class="task-card lk-card lk-screen" id="card-${task.id}">
      <div class="task-head">
        <div class="task-label-wrap">
          <span class="lk-tasknum">${num}</span>
          ${subtitle ? `<span class="task-label">${subtitle}</span>` : ''}
        </div>
        ${hasHint ? `<button class="lk-hint-btn lk-hint-btn--alive" id="hint-btn-${task.id}" type="button" aria-expanded="false" aria-controls="hint-${task.id}" aria-label="Подсказка от Леммы">Λ</button>` : ''}
      </div>
      ${hasHint ? `<div class="lk-hint-panel" id="hint-${task.id}"><div class="lk-hint-inner"><div class="lk-hint-body"><span class="lk-hint-tag">Λ Подсказка</span>${fmtInline(task.hint)}</div></div></div>` : ''}
      <p class="task-intro">${fmtInline(task.intro)}</p>
      <div class="task-body" id="body-${task.id}"></div>
      <div class="task-feedback" id="fb-${task.id}"><div class="fb-label">Разбор</div>${renderFeedback(task.feedback)}</div>
      ${isSlider ? '' : `<button class="lk-btn check-btn" id="btn-${task.id}">Проверить</button>`}
      <button class="lk-btn next-btn" id="next-${task.id}" hidden>${isLast ? 'К итогам ✨' : 'Дальше →'}</button>
    </div>
    ${resetStripHtml()}`;
  window.scrollTo(0, 0);
  wireReset(screen);

  const card = document.getElementById(`card-${task.id}`);
  const body = document.getElementById(`body-${task.id}`);
  const nextBtn = document.getElementById(`next-${task.id}`);

  const hintBtn = document.getElementById(`hint-btn-${task.id}`);
  if (hintBtn) {
    const panel = document.getElementById(`hint-${task.id}`);
    hintBtn.addEventListener('click', () => {
      const open = panel.classList.toggle('is-open');
      hintBtn.classList.toggle('is-open', open);
      hintBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  }
  nextBtn.addEventListener('click', () => { idx++; render(); });

  if (isSlider) { renderSlider(task, body, card, nextBtn); return; }

  body.innerHTML = buildBody(task);
  const checker = initMechanic(task, card);
  const checkBtn = document.getElementById(`btn-${task.id}`);
  checkBtn.addEventListener('click', () => {
    const res = checker.check();
    if (!res || !res.ok) { shake(checkBtn); return; }
    boom(res.correct);
    cardReact(card, res.correct);
    document.getElementById(`fb-${task.id}`).classList.add('show');
    checkBtn.disabled = true; checkBtn.hidden = true; nextBtn.hidden = false;
    recordResult(task, res.correct, res.wrong, res);
  });
}

function renderSlider(task, body, card, nextBtn) {
  const cfg = task.mechanic === 'slider_abs'
    ? { mode: 'abs', rounds: task.rounds, roundHints: task.roundHints }
    : { mode: 'line', stars: task.stars, target: task.target, frozen: task.frozen };
  let done = false;
  createEngine(body, cfg, () => {
    if (done) return; done = true;
    cardReact(card, true);
    document.getElementById(`fb-${task.id}`).classList.add('show');
    nextBtn.hidden = false;
    recordResult(task, true, []);
    if (task.bonus) injectBonus(card, task.bonus, nextBtn);
  });
}

// Бонус-открытие (после шага 5): три звезды, поймать две — третью не поймать никак.
function injectBonus(card, bonus, nextBtn) {
  const wrap = document.createElement('div');
  wrap.className = 'task-feedback show';
  wrap.style.background = 'rgba(168,85,247,.08)';
  wrap.style.borderColor = 'rgba(168,85,247,.28)';
  wrap.innerHTML = `
    <div class="fb-label" style="color:var(--lk-violet)">⭐ Бонус — по желанию</div>
    <p class="fb-p">${fmtInline(bonus.hint)}</p>
    <button class="lk-btn lk-ghost" id="bonus-open" type="button" style="width:100%;margin-top:6px">Открыть фокус ⭐</button>
    <div id="bonus-host" hidden style="margin-top:14px"></div>
    <div id="bonus-reveal" hidden style="margin-top:12px"></div>`;
  nextBtn.parentNode.insertBefore(wrap, nextBtn);

  const openBtn = wrap.querySelector('#bonus-open');
  const host = wrap.querySelector('#bonus-host');
  const reveal = wrap.querySelector('#bonus-reveal');
  openBtn.addEventListener('click', () => {
    openBtn.hidden = true; host.hidden = false;
    let bdone = false;
    createEngine(host, { mode: 'line', stars: bonus.stars, target: bonus.target, winStars: bonus.winStars }, () => {
      if (bdone) return; bdone = true;
      reveal.hidden = false;
      reveal.innerHTML = `<p class="fb-p" style="color:var(--lk-ink)">${fmtInline(bonus.reveal)}</p>`;
      reveal.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  });
}

// ── ОТЧЁТ И РАЗБОР (#38) ──────────────────────────────────────────────────────
// Механика общая для всех домашек — движок по URL (di-brand-kit/hw-core.js).
// Здесь остаётся только своё: как эта домашка рисует свою математику.

const REV_HELPERS = { fmtInline, renderFeedback };

function reportResults(score, total) {
  if (reported) return;
  const hw = `${DATA.meta.kicker} — ${DATA.meta.title}`;
  const durationSec = startPerf != null ? Math.round((performance.now() - startPerf) / 1000) : null;
  const sent = HwCore.report({
    hw, hw_id: HW_ID, score, total, results,
    startedAt: startTs ? localIso(startTs) : null,
    durationSec, devMode, allowSend,
  });
  if (sent) { reported = true; saveProgress(); }
}

// ── ЭКРАН ИТОГОВ ──────────────────────────────────────────────────────────────

function showFinal() {
  document.getElementById('screen').hidden = true;
  document.getElementById('hw-header').hidden = true;
  playSound('snd-final');

  const total = DATA.tasks.length;
  finished = true;
  reportResults(firstTryCount, total);
  saveProgress();
  const tier = firstTryCount === total ? '🏆 Идеально — ни одной осечки!'
             : firstTryCount >= total - 2 ? '💪 Крепко держишь прямую!'
             : '🔁 Загляни в разборы — и прокрути ещё разок.';

  const revHtml = HwCore.revItemsHtml(results, REV_HELPERS);

  const f = DATA.final;
  // Единый блок «цифры» — как на всех финалах: верно/всего · точность · время.
  const pct = total ? Math.round(firstTryCount / total * 100) : 0;
  const durSec = startPerf != null ? Math.round((performance.now() - startPerf) / 1000) : null;
  const durTxt = fmtDur(durSec);
  const statsHtml = `
    <div class="fin-stats" style="display:flex;gap:10px;flex-wrap:wrap;margin:14px 0 4px">
      <div class="fin-stat" style="flex:1;min-width:88px;text-align:center;padding:12px 8px;border-radius:14px;background:rgba(124,108,240,.12);border:1px solid rgba(124,108,240,.28)">
        <div style="font-size:26px;font-weight:700;line-height:1">${firstTryCount}<span style="font-size:15px;opacity:.6">/${total}</span></div>
        <div style="font-size:11px;opacity:.7;margin-top:3px">с первого раза</div>
      </div>
      <div class="fin-stat" style="flex:1;min-width:88px;text-align:center;padding:12px 8px;border-radius:14px;background:rgba(79,169,255,.12);border:1px solid rgba(79,169,255,.28)">
        <div style="font-size:26px;font-weight:700;line-height:1">${pct}<span style="font-size:15px;opacity:.6">%</span></div>
        <div style="font-size:11px;opacity:.7;margin-top:3px">точность</div>
      </div>
      ${durTxt ? `<div class="fin-stat" style="flex:1;min-width:88px;text-align:center;padding:12px 8px;border-radius:14px;background:rgba(91,191,138,.12);border:1px solid rgba(91,191,138,.28)">
        <div style="font-size:20px;font-weight:700;line-height:1.2">${durTxt}</div>
        <div style="font-size:11px;opacity:.7;margin-top:3px">время</div>
      </div>` : ''}
    </div>`;
  const el = document.getElementById('final-screen');
  el.innerHTML = `
    <div class="lk-card" style="padding:22px 18px">
      <div class="fin-theme">${f.theme}</div>
      <div class="fin-tier">${tier}</div>
      ${statsHtml}
      ${revHtml}
    </div>
    <div class="lk-card fin-card">
      <div class="fin-unlock">${f.unlock}</div>
      <p class="fin-tease">${fmtInline(f.tease)}</p>
      <p class="fin-counter"><b>${firstTryCount}</b> ${f.counter_label} из ${total}</p>
    </div>
    ${reported
      ? `<p class="send-note" style="text-align:center">✅ Результат уже отправлен репетитору — он увидит, что освоено, а что подтянуть.</p>`
      : ''}
    <button id="btn-retry" class="lk-btn" style="width:100%;margin-top:16px;padding:14px;border-radius:14px;font-size:15px;font-weight:600;background:rgba(124,108,240,.14);border:1px solid rgba(124,108,240,.35);color:inherit;cursor:pointer">🔁 Пройти заново</button>
    <div class="lk-sign" style="margin-top:22px">
      <span class="lk-badge lk-badge-l">Λ</span>
      <span class="lk-badge lk-badge-d">D.</span>
    </div>
    <div style="height:32px"></div>`;
  el.classList.add('show');
  window.scrollTo(0, 0);

  const retry = document.getElementById('btn-retry');
  if (retry) retry.addEventListener('click', showResetConfirm);

  // Раскрытие — движком. Своя копия открывала ТОЛЬКО ошибочные (`.rev-item.bad`):
  // ученик, решивший всё верно, не мог заглянуть ни в одно задание, и стили
  // разбора из hw-core на финал не доезжали.
  HwCore.bindToggles(el);
}

// ── ИНИЦИАЛИЗАЦИЯ ─────────────────────────────────────────────────────────────

// Показать рабочие экраны (обложки нет — вход сразу в задание).
function showAppScreens() {
  document.getElementById('hw-header').hidden = false;
  document.getElementById('screen').hidden = false;
}

function startHw() {
  showAppScreens();
  // Звук на старте НЕ играем. Раньше здесь звучала победная мелодия, а следом
  // «будились» проигрыш и финал обычным play() — ученик открывал ссылку и слышал
  // все три разом (Ди, 13.07). Будим молча (muted) — движок hw-core.js.
  HwCore.unlockAudio(['snd-win', 'snd-lose', 'snd-final']);
  render();
}

function restoreProgress() {
  const saved = loadProgress();
  if (!saved || !Array.isArray(saved.results) || !saved.results.length) return false;
  saved.results.forEach(r => results.push(r));
  firstTryCount = (typeof saved.firstTryCount === 'number') ? saved.firstTryCount : results.filter(r => r && r.correct).length;
  combo = saved.combo || 0; reported = !!saved.reported; finished = !!saved.finished;
  idx = results.length;
  showAppScreens();
  if (finished || idx >= DATA.tasks.length) showFinal(); else render();
  return true;
}

function devGoto(n) {
  devMode = true;
  const total = DATA.tasks.length;
  const target = clamp(n, 1, total) - 1;
  for (let i = 0; i < target; i++) {
    const t = DATA.tasks[i];
    results[i] = { label: t.label, diff: t.difficulty, correct: true, wrong: [], feedback: t.feedback };
  }
  firstTryCount = target; idx = target;
  showAppScreens();
  render();
}

function init(data) {
  DATA = data;

  // Кнопки полноэкранного подтверждения «Заново» (вешаем один раз).
  const yes = document.getElementById('reset-yes');
  const no  = document.getElementById('reset-no');
  if (yes) yes.addEventListener('click', doReset);
  if (no)  no.addEventListener('click', hideResetConfirm);

  const qs = new URLSearchParams(location.search);
  // `?r=ник.id` — Ди смотрит разбор попытки ученика. Домашку не запускаем.
  const rev = HwCore.reviewCode();
  if (rev) {
    HwCore.showReview(rev, {
      mount: document.getElementById('final-screen'),
      helpers: REV_HELPERS,
      hide: [document.getElementById('screen'), document.getElementById('hw-header')],
    });
    return;
  }
  if (qs.get('reset') === '1') clearProgress();
  allowSend = qs.get('send') === '1';
  const g = parseInt(qs.get('g') || qs.get('goto'), 10);
  if (!isNaN(g)) { devGoto(g); return; }
  // Нет стартового экрана: продолжаем сохранённый прогресс либо сразу первый вопрос.
  if (!restoreProgress()) startHw();
}

fetch('data.json?v=1')
  .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
  .then(init)
  .catch(() => {
    document.getElementById('screen').hidden = false;
    document.getElementById('screen').innerHTML =
      '<p style="color:var(--lk-bad);padding:20px;font-size:15px">Ошибка загрузки данных. Обновите страницу.</p>';
  });
