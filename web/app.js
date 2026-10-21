// app.js — หน้าเว็บวัดมุมจากรูป (พอร์ตจาก measure_angle.m)
// แต่ละมุมคลิก 3 จุด: จุดยอดมุม → ปลายแขนข้างที่ 1 → ปลายแขนข้างที่ 2
// ทุกอย่างทำงานในเบราว์เซอร์ รูปไม่ถูกอัปโหลดไปที่ไหน
import { angleFromPoints, arcSpan, renderTestTriangle } from './angle.js';

// ===== ค่าคงที่ =====
const COLORS = ['#0072BD', '#D95319', '#EDB120', '#7E2F8E', '#77AC30', '#4DBEEE', '#A2142F'];  // = lines(7) ของ MATLAB
const STEPS = ['จุดยอดมุม', 'ปลายแขนข้างที่ 1', 'ปลายแขนข้างที่ 2'];
const FONT = '"IBM Plex Sans Thai", system-ui, sans-serif';
const LOUPE_ZOOM = 4;
const MAX_EXPORT_PIXELS = 16e6;                       // iOS Safari สร้าง canvas ใหญ่กว่านี้ไม่ได้
const INSET = { top: 60, bottom: 68, side: 12 };      // เว้นที่ให้แถบคำแนะนำ (บน) และแถบเครื่องมือ (ล่าง)
const coarsePointer = matchMedia('(pointer: coarse)');

const $ = (id) => document.getElementById(id);
const el = {
  stage: $('stage'), canvas: $('canvas'), empty: $('empty'),
  prompt: $('prompt'), promptText: $('promptText'), promptDots: $('promptDots'),
  toolbar: $('toolbar'), btnUndo: $('btnUndo'), btnLoupe: $('btnLoupe'),
  fileInput: $('fileInput'), imgInfo: $('imgInfo'), results: $('results'), count: $('count'),
  btnPng: $('btnPng'), btnCsv: $('btnCsv'), btnClear: $('btnClear'),
  dropOverlay: $('dropOverlay'), toast: $('toast'),
};
const ctx = el.canvas.getContext('2d');

const state = {
  img: null, w: 0, h: 0, name: '',
  truth: null,                  // มุมจริงของภาพตัวอย่าง { vertices, angles }
  angles: [],                   // มุมที่วัดเสร็จแล้ว { id, ci, pts: [V, P1, P2] } (ci = ลำดับสี)
  pending: [],                  // จุดของมุมที่กำลังวัด (0–2 จุด)
  colorIndex: 0, nextId: 1,
  view: { s: 1, x: 0, y: 0 },   // พิกัดจอ = พิกัดภาพ * s + (x, y)
  fitted: true,
  hover: null, hoverScreen: null, hoverHit: null, hoverRadius: 9,
  listHover: null,
  loupe: true,
};
let size = { cw: 0, ch: 0 };
let gesture = null;             // press | drag | pan | pinch | ignore
const pointers = new Map();

// ===== เรขาคณิตและพิกัด =====
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
const toScreen = (p, v = state.view) => [p[0] * v.s + v.x, p[1] * v.s + v.y];
const toImage = (q) => [(q[0] - state.view.x) / state.view.s, (q[1] - state.view.y) / state.view.s];
const inImage = (p) => p[0] >= 0 && p[1] >= 0 && p[0] <= state.w && p[1] <= state.h;
const clampToImage = (p) => [Math.min(Math.max(p[0], 0), state.w), Math.min(Math.max(p[1], 0), state.h)];
const angleOf = (pts) => angleFromPoints(pts[0], pts[1], pts[2]);
const colorOf = (a) => COLORS[a.ci % COLORS.length];
const pendingColor = () => COLORS[state.colorIndex % COLORS.length];

// พิกัด canvas เริ่มที่ขอบพิกเซล ส่วน MATLAB นับศูนย์กลางพิกเซลแรกเป็น (1, 1)
const toMatlab = (p) => [p[0] + 0.5, p[1] + 0.5];
const fromMatlab = (p) => [p[0] - 0.5, p[1] - 0.5];
function fmtPoint(p) {
  const [x, y] = toMatlab(p);
  return `(${x.toFixed(0)}, ${y.toFixed(0)})`;
}
const signed = (x) => `${x < 0 ? '−' : '+'}${Math.abs(x).toFixed(2)}`;

// ===== จุดที่วางแล้ว =====
const getPoint = (ref) => (ref.a < 0 ? state.pending : state.angles[ref.a].pts)[ref.k];
function setPoint(ref, p) {
  (ref.a < 0 ? state.pending : state.angles[ref.a].pts)[ref.k] = p;
}
const hitRadius = (pointerType) => (pointerType === 'mouse' ? 9 : 18);

// ทุกจุดที่อยู่ตำแหน่งเดียวกับ p (จุดร่วมจากการคลิกซ้ำ) จะถูกลากไปด้วยกัน
function refsAt(p) {
  const same = (q) => q[0] === p[0] && q[1] === p[1];
  const refs = [];
  state.angles.forEach((a, i) => a.pts.forEach((q, k) => same(q) && refs.push({ a: i, k })));
  state.pending.forEach((q, k) => same(q) && refs.push({ a: -1, k }));
  return refs;
}

// หาจุดที่ใกล้ตำแหน่งจอ q ที่สุดภายในรัศมี (หน่วย px บนจอ)
function hitTest(q, radius) {
  let best = null, bestD = radius;
  const check = (p, ref) => {
    const d = dist(toScreen(p), q);
    if (d <= bestD) { bestD = d; best = ref; }
  };
  state.angles.forEach((a, i) => a.pts.forEach((p, k) => check(p, { a: i, k })));
  state.pending.forEach((p, k) => check(p, { a: -1, k }));
  return best;
}

// จุดที่จะถูกวางถ้าคลิกตอนนี้ (ดูดเข้าจุดเดิมถ้าชี้อยู่ใกล้)
function previewPoint() {
  if (!state.hover || (gesture && gesture.type !== 'press')) return null;
  const p = state.hoverHit ? getPoint(state.hoverHit) : state.hover;
  return inImage(p) ? p : null;
}

function highlightId() {
  const h = gesture?.type === 'drag' ? gesture.ref : state.hoverHit;
  if (h && h.a >= 0) return state.angles[h.a]?.id ?? null;
  return state.listHover;
}

// ===== แก้ไขข้อมูลมุม =====
function placePoint(p) {
  if (!p) {
    toast('วางจุดได้เฉพาะในรูป');
    return;
  }
  state.pending.push([p[0], p[1]]);
  if (state.pending.length === 3) {
    state.angles.push({ id: state.nextId++, ci: state.colorIndex++, pts: state.pending });
    state.pending = [];
  }
  structureChanged();
}

function undo() {
  if (state.pending.length) {
    state.pending.pop();
  } else if (state.angles.length) {
    const a = state.angles.pop();               // ย้อนคลิกที่ 3 ของมุมล่าสุด
    state.pending = a.pts.slice(0, 2);
    state.colorIndex = a.ci;
  } else {
    return;
  }
  structureChanged();
}

function cancelPending() {
  if (!state.pending.length) return;
  state.pending = [];
  structureChanged();
}

function deleteAngle(i) {
  state.angles.splice(i, 1);
  state.listHover = null;
  structureChanged();
}

function clearAll() {
  if (!state.angles.length && !state.pending.length) return;
  if (state.angles.length && !confirm('ล้างผลการวัดทั้งหมด?')) return;
  state.angles = [];
  state.pending = [];
  state.colorIndex = 0;
  structureChanged();
}

function structureChanged() {
  if (gesture && gesture.type !== 'pan' && gesture.type !== 'pinch') gesture = null;  // ref เดิมอาจชี้ผิดจุดแล้ว
  updateHover();
  renderPanel();
  renderPrompt();
  requestRender();
}

// ===== วาดภาพ =====
let raf = 0;
function requestRender() {
  if (!raf) raf = requestAnimationFrame(render);
}

function render() {
  raf = 0;
  const dpr = window.devicePixelRatio || 1;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, size.cw, size.ch);
  if (!state.img) return;
  drawScene(ctx, state.view, 1, true);
  drawLoupe();
}

// k = ตัวคูณขนาดเส้น/ตัวอักษร (1 บนจอ, มากกว่า 1 ตอนบันทึกรูปความละเอียดเต็ม)
// live = วาดมุมที่กำลังวัดและไฮไลต์ด้วย (ไม่ใส่ในรูปที่บันทึก)
function drawScene(c, view, k, live) {
  c.imageSmoothingEnabled = view.s < 3;           // ซูมมาก ๆ ให้เห็นพิกเซลชัด จะได้คลิกแม่น
  c.imageSmoothingQuality = 'high';
  c.drawImage(state.img, view.x, view.y, state.w * view.s, state.h * view.s);
  const hl = live ? highlightId() : null;
  state.angles.forEach((a, i) => {
    const S = a.pts.map((p) => toScreen(p, view));
    drawAngle(c, k, S, colorOf(a), i + 1, angleOf(a.pts), a.id === hl);
  });
  if (live) drawPending(c, view);
}

function drawAngle(c, k, S, color, num, deg, bold) {
  const [V, P1, P2] = S;
  strokePath(c, [P1, V, P2], color, (bold ? 3.5 : 2.5) * k, k);
  drawArcLabel(c, k, S, color, num, deg, false);
  S.forEach((p) => drawMarker(c, p, color, k, bold));
}

// มุมที่กำลังคลิก: แสดงเส้นประไปยังเมาส์ และค่ามุมสดเมื่อมีครบ 2 จุด
function drawPending(c, view) {
  const color = pendingColor();
  const P = state.pending.map((p) => toScreen(p, view));
  const cur = previewPoint();
  const C = cur && toScreen(cur, view);
  if (P.length === 1 && C) strokePath(c, [P[0], C], color, 2, 1, true);
  if (P.length === 2) {
    strokePath(c, [P[1], P[0]], color, 2.5, 1);
    if (C) {
      strokePath(c, [P[0], C], color, 2, 1, true);
      const deg = angleFromPoints(state.pending[0], state.pending[1], cur);
      drawArcLabel(c, 1, [P[0], P[1], C], color, state.angles.length + 1, deg, true);
    }
  }
  P.forEach((p) => drawMarker(c, p, color, 1, false));
  if (state.hoverHit && (!gesture || gesture.type === 'press')) {
    const [x, y] = toScreen(getPoint(state.hoverHit), view);
    c.beginPath();
    c.arc(x, y, 10, 0, 2 * Math.PI);
    c.lineWidth = 2;
    c.strokeStyle = '#fff';
    c.stroke();
  }
}

// ส่วนโค้งทางที่สั้นกว่า + ป้ายตัวเลขตามแนวเส้นแบ่งครึ่งมุม (เหมือน draw_angle ใน MATLAB)
function drawArcLabel(c, k, [V, P1, P2], color, num, deg, preview) {
  const arm = Math.min(dist(V, P1), dist(V, P2));
  if (arm < 1) return;
  const { start, sweep } = arcSpan(V, P1, P2);
  const r = Math.min(Math.max(0.3 * arm, 16 * k), arm);
  c.beginPath();
  c.arc(V[0], V[1], r, start, start + sweep, sweep < 0);
  strokeCurrent(c, color, 2 * k, k, preview);
  const m = start + sweep / 2;
  const d = 1.6 * r + 12 * k;
  drawLabel(c, k, V[0] + d * Math.cos(m), V[1] + d * Math.sin(m), num, `${deg.toFixed(1)}°`, color, preview);
}

function strokePath(c, pts, color, w, k, dashed = false) {
  c.beginPath();
  pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
  strokeCurrent(c, color, w, k, dashed);
}

function strokeCurrent(c, color, w, k, dashed) {
  c.lineCap = 'round';
  c.lineJoin = 'round';
  c.setLineDash(dashed ? [6 * k, 5 * k] : []);
  c.strokeStyle = 'rgba(0, 0, 0, 0.45)';          // ขอบเข้มรอบเส้น ให้เห็นชัดทั้งบนพื้นสว่างและมืด
  c.lineWidth = w + 2.5 * k;
  c.stroke();
  c.strokeStyle = color;
  c.lineWidth = w;
  c.stroke();
  c.setLineDash([]);
}

function drawMarker(c, [x, y], color, k, big) {
  c.beginPath();
  c.arc(x, y, (big ? 6 : 4.5) * k, 0, 2 * Math.PI);
  c.fillStyle = color;
  c.fill();
  c.lineWidth = 1.75 * k;
  c.strokeStyle = '#fff';
  c.stroke();
}

function drawLabel(c, k, x, y, num, text, color, preview) {
  const h = 24 * k, pad = 6 * k, badge = 16 * k, gap = 5 * k;
  c.font = `600 ${13 * k}px ${FONT}`;
  const w = pad + badge + gap + c.measureText(text).width + pad + k;
  const x0 = x - w / 2;
  c.beginPath();
  if (c.roundRect) c.roundRect(x0, y - h / 2, w, h, 6 * k);
  else c.rect(x0, y - h / 2, w, h);
  c.fillStyle = preview ? 'rgba(255, 255, 255, 0.85)' : 'rgba(255, 255, 255, 0.95)';
  c.fill();
  c.setLineDash(preview ? [3 * k, 3 * k] : []);
  c.lineWidth = 1.5 * k;
  c.strokeStyle = color;
  c.stroke();
  c.setLineDash([]);

  const bx = x0 + pad + badge / 2;
  c.beginPath();
  c.arc(bx, y, badge / 2, 0, 2 * Math.PI);
  c.fillStyle = color;
  c.fill();
  c.textBaseline = 'middle';
  c.textAlign = 'center';
  c.fillStyle = textOn(color);
  c.font = `700 ${10 * k}px ${FONT}`;
  c.fillText(String(num), bx, y + 0.5 * k);
  c.textAlign = 'left';
  c.fillStyle = '#15181d';
  c.font = `600 ${13 * k}px ${FONT}`;
  c.fillText(text, x0 + pad + badge + gap, y + 0.5 * k);
}

// เลือกสีตัวอักษร (ดำ/ขาว) ที่อ่านง่ายบนพื้นสีนั้น
function textOn(hex) {
  const lin = (i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const L = 0.2126 * lin(1) + 0.7152 * lin(3) + 0.0722 * lin(5);
  return L > 0.179 ? '#15181d' : '#ffffff';
}

// แว่นขยายมุมจอ อยู่ฝั่งตรงข้ามกับเมาส์/นิ้ว เพื่อเล็งจุดได้แม่น
function drawLoupe() {
  if (!state.loupe || !state.hoverScreen) return;
  let center = null;
  if (gesture?.type === 'drag') center = getPoint(gesture.ref);
  else if (!gesture || gesture.type === 'press') center = previewPoint();
  if (!center) return;

  const { cw, ch } = size;
  const R = Math.min(cw, ch) < 520 ? 56 : 72;
  const [sx, sy] = state.hoverScreen;
  const cx = sx < cw / 2 ? cw - 14 - R : 14 + R;
  const cy = sy < ch / 2 ? ch - INSET.bottom - R : INSET.top + R;
  const s = Math.min(state.view.s * LOUPE_ZOOM, Math.max(state.view.s, 60));

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, 2 * Math.PI);
  ctx.clip();
  ctx.fillStyle = '#0e1013';
  ctx.fillRect(cx - R, cy - R, 2 * R, 2 * R);
  drawScene(ctx, { s, x: cx - center[0] * s, y: cy - center[1] * s }, 1, true);
  ctx.beginPath();
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    ctx.moveTo(cx + dx * 5, cy + dy * 5);
    ctx.lineTo(cx + dx * 16, cy + dy * 16);
  }
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.6)';
  ctx.stroke();
  ctx.lineWidth = 1.25;
  ctx.strokeStyle = '#fff';
  ctx.stroke();
  ctx.restore();

  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, 2 * Math.PI);
  ctx.lineWidth = 4;
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)';
  ctx.stroke();
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#fff';
  ctx.stroke();
}

// ===== แผงผลการวัดและแถบคำแนะนำ =====
function truthFor(a) {
  if (!state.truth) return null;
  let best = null, bestD = 30;                    // จุดยอดต้องอยู่ห่างจุดยอดจริงไม่เกิน 30 px
  state.truth.vertices.forEach((v, i) => {
    const d = dist(a.pts[0], v);
    if (d < bestD) { bestD = d; best = state.truth.angles[i]; }
  });
  return best;
}

const X_ICON = '<svg class="i" viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12"/></svg>';

function renderPanel() {
  const n = state.angles.length;
  el.count.textContent = `${n} มุม`;
  el.btnPng.disabled = el.btnCsv.disabled = !n;
  el.btnClear.disabled = !n && !state.pending.length;
  el.btnUndo.disabled = !n && !state.pending.length;
  if (!n) {
    el.results.innerHTML = `<p class="note">${state.img ? 'ยังไม่ได้วัดมุม' : 'เลือกรูปเพื่อเริ่มวัด'}</p>`;
    return;
  }

  const items = state.angles.map((a, i) => {
    const color = colorOf(a);
    const deg = angleOf(a.pts);
    const truth = truthFor(a);
    let extra = '';
    if (truth !== null) {
      const err = deg - truth;
      const cls = Math.abs(err) < 1 ? 'good' : Math.abs(err) < 3 ? 'mid' : 'bad';
      extra = `<div class="result-err">ค่าจริง ${truth}° · คลาดเคลื่อน <b class="err-${cls}">${signed(err)}°</b></div>`;
    }
    const [V, P1, P2] = a.pts;
    return `<li class="result" data-id="${a.id}" style="--c:${color}">
      <span class="swatch" style="color:${textOn(color)}">${i + 1}</span>
      <div>
        <div class="result-deg">${deg.toFixed(2)}°</div>
        <div class="result-pts">จุดยอด ${fmtPoint(V)} · แขน 1 ${fmtPoint(P1)} · แขน 2 ${fmtPoint(P2)}</div>
        ${extra}
      </div>
      <button class="icon-btn" type="button" data-del="${i}" title="ลบมุมนี้" aria-label="ลบมุมที่ ${i + 1}">${X_ICON}</button>
    </li>`;
  });

  let summary = '';
  if (n > 1) {
    const sum = state.angles.reduce((t, a) => t + angleOf(a.pts), 0);
    const theory = state.truth && n === 3 ? ' (ทฤษฎี = 180°)' : '';
    summary = `<p class="summary">ผลรวมมุมที่วัดได้ <b>${sum.toFixed(2)}°</b>${theory}</p>`;
  }
  el.results.innerHTML = `<ol class="result-list">${items.join('')}</ol>${summary}`;
  markListHover();
}

function markListHover() {
  const id = highlightId();
  for (const li of el.results.querySelectorAll('[data-id]')) {
    li.classList.toggle('hl', Number(li.dataset.id) === id);
  }
}

function renderPrompt() {
  const has = !!state.img;
  el.empty.hidden = has;
  el.prompt.hidden = el.toolbar.hidden = !has;
  if (!has) return;
  const step = state.pending.length;
  const verb = coarsePointer.matches ? 'แตะ' : 'คลิก';
  el.promptText.innerHTML = `<b>มุมที่ ${state.angles.length + 1}</b> · ${verb}${STEPS[step]}`;
  el.promptDots.style.setProperty('--c', pendingColor());
  [...el.promptDots.children].forEach((d, i) => {
    d.className = i < step ? 'done' : i === step ? 'now' : '';
  });
}

// ===== มุมมอง: ซูมและเลื่อน =====
function fitView() {
  const aw = Math.max(size.cw - 2 * INSET.side, 40);
  const ah = Math.max(size.ch - INSET.top - INSET.bottom, 40);
  const s = Math.min(aw / state.w, ah / state.h);
  return { s, x: INSET.side + (aw - state.w * s) / 2, y: INSET.top + (ah - state.h * s) / 2 };
}

function clampScale(s) {
  const fs = fitView().s;
  return Math.min(Math.max(s, fs * 0.5), Math.max(fs * 4, 40));
}

function fit() {
  if (!state.img) return;
  state.view = fitView();
  state.fitted = true;
  updateHover();
  requestRender();
}

function zoomAt(q, f) {
  if (!state.img) return;
  const v = state.view;
  const s = clampScale(v.s * f);
  const ix = (q[0] - v.x) / v.s, iy = (q[1] - v.y) / v.s;
  state.view = { s, x: q[0] - ix * s, y: q[1] - iy * s };
  state.fitted = false;
  updateHover();
  requestRender();
}
const zoomCenter = (f) => zoomAt([size.cw / 2, size.ch / 2], f);

// ===== เมาส์ นิ้ว และปากกา =====
function screenPos(e) {
  const r = el.canvas.getBoundingClientRect();
  return [e.clientX - r.left, e.clientY - r.top];
}

function setHover(q, pointerType) {
  state.hoverScreen = q;
  if (pointerType) state.hoverRadius = hitRadius(pointerType);
  updateHover();
}

function updateHover() {
  const q = state.hoverScreen;
  state.hover = q && toImage(q);
  state.hoverHit = q && gesture?.type !== 'drag' ? hitTest(q, state.hoverRadius) : null;
  const busy = gesture && gesture.type !== 'press';
  el.canvas.style.cursor = busy ? 'grabbing' : state.hoverHit ? 'grab' : 'crosshair';
  markListHover();
}

el.canvas.addEventListener('pointerdown', (e) => {
  if (!state.img) return;
  e.preventDefault();
  el.canvas.setPointerCapture(e.pointerId);
  const q = screenPos(e);
  pointers.set(e.pointerId, q);
  if (pointers.size === 2) return startPinch();
  if (pointers.size > 2) return;
  if (e.pointerType === 'mouse' && e.button !== 0) {
    gesture = { type: 'pan', id: e.pointerId, last: q };     // ปุ่มขวา/กลาง = เลื่อนภาพ
    setHover(null);
  } else {
    const hit = hitTest(q, hitRadius(e.pointerType));
    gesture = { type: 'press', id: e.pointerId, start: q, hit, touch: e.pointerType !== 'mouse' };
    setHover(q, e.pointerType);
  }
  requestRender();
});

el.canvas.addEventListener('pointermove', (e) => {
  if (!state.img) return;
  const q = screenPos(e);
  if (pointers.has(e.pointerId)) pointers.set(e.pointerId, q);
  if (gesture?.type === 'pinch') return updatePinch();
  if (gesture?.type === 'ignore') return;
  if (gesture && gesture.id !== e.pointerId) return;
  if (!gesture && e.pointerType === 'touch') return;

  // กดแล้วขยับ: บนจุดเดิม = ลากจุด, ที่ว่าง (เมาส์) = เลื่อนภาพ, ที่ว่าง (นิ้ว) = เล็งต่อ
  if (gesture?.type === 'press' && dist(q, gesture.start) > (gesture.touch ? 8 : 4)) {
    if (gesture.hit) {
      const p = getPoint(gesture.hit);
      const ps = toScreen(p);
      const off = [ps[0] - gesture.start[0], ps[1] - gesture.start[1]];
      gesture = { type: 'drag', id: e.pointerId, ref: gesture.hit, refs: refsAt(p), off };
    } else if (!gesture.touch) {
      gesture = { type: 'pan', id: e.pointerId, last: gesture.start };
    }
  }

  if (gesture?.type === 'pan') {
    const v = state.view;
    state.view = { s: v.s, x: v.x + q[0] - gesture.last[0], y: v.y + q[1] - gesture.last[1] };
    state.fitted = false;
    gesture.last = q;
    setHover(null);
  } else if (gesture?.type === 'drag') {
    const p = clampToImage(toImage([q[0] + gesture.off[0], q[1] + gesture.off[1]]));
    gesture.refs.forEach((ref) => setPoint(ref, p));
    setHover(q, e.pointerType);
    renderPanel();
  } else {
    setHover(q, e.pointerType);
  }
  requestRender();
});

function endPointer(e) {
  if (!pointers.delete(e.pointerId)) return;
  const g = gesture;
  if (g?.type === 'pinch' || g?.type === 'ignore') {
    gesture = pointers.size ? { type: 'ignore' } : null;    // นิ้วที่เหลือหลังหนีบซูมไม่นับเป็นการแตะ
  } else if (g && g.id === e.pointerId) {
    if (g.type === 'press' && e.type === 'pointerup') {
      setHover(screenPos(e), e.pointerType);
      placePoint(previewPoint());
    }
    gesture = null;
  }
  setHover(e.pointerType === 'mouse' ? screenPos(e) : null, e.pointerType);
  requestRender();
}
el.canvas.addEventListener('pointerup', endPointer);
el.canvas.addEventListener('pointercancel', endPointer);
el.canvas.addEventListener('pointerleave', (e) => {
  if (e.pointerType === 'mouse' && !gesture) {
    setHover(null);
    requestRender();
  }
});
el.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

function startPinch() {
  const [a, b] = [...pointers.values()];
  gesture = { type: 'pinch', d0: Math.max(dist(a, b), 1), m0: mid(a, b), v0: { ...state.view } };
  setHover(null);
  requestRender();
}

function updatePinch() {
  const [a, b] = [...pointers.values()];
  const { d0, m0, v0 } = gesture;
  const s = clampScale((v0.s * dist(a, b)) / d0);
  const m = mid(a, b);
  const ix = (m0[0] - v0.x) / v0.s, iy = (m0[1] - v0.y) / v0.s;
  state.view = { s, x: m[0] - ix * s, y: m[1] - iy * s };
  state.fitted = false;
  requestRender();
}

el.canvas.addEventListener('wheel', (e) => {
  if (!state.img) return;
  e.preventDefault();
  const rate = e.deltaMode === 1 ? 0.05 : e.ctrlKey ? 0.01 : 0.0015;   // ctrlKey = หนีบบน trackpad
  zoomAt(screenPos(e), Math.exp(-e.deltaY * rate));
}, { passive: false });

window.addEventListener('keydown', (e) => {
  if (!state.img || e.target.closest?.('input, textarea')) return;
  const key = e.key.toLowerCase();
  if ((e.ctrlKey || e.metaKey) && key === 'z') {
    e.preventDefault();
    undo();
  } else if (e.ctrlKey || e.metaKey || e.altKey) {
    return;
  } else if (key === 'backspace') {
    e.preventDefault();
    undo();
  } else if (key === 'escape') {
    cancelPending();
  } else if (key === '+' || key === '=') {
    zoomCenter(1.25);
  } else if (key === '-' || key === '_') {
    zoomCenter(0.8);
  } else if (key === '0') {
    fit();
  }
});

// ===== เปิดรูป =====
function setImage(img, name, truth = null) {
  if (state.angles.length && !confirm('เปลี่ยนรูปใหม่? ผลที่วัดไว้จะหายไป')) return false;
  Object.assign(state, {
    img, name, truth,
    w: img.naturalWidth || img.width,
    h: img.naturalHeight || img.height,
    angles: [], pending: [], colorIndex: 0, listHover: null,
  });
  gesture = null;
  el.imgInfo.textContent = `${name} · ${state.w}×${state.h} px`;
  el.imgInfo.hidden = false;
  fit();
  structureChanged();
  return true;
}

async function loadFile(file) {
  if (!file) return;
  if (file.type && !file.type.startsWith('image/')) {
    toast('ไฟล์นี้ไม่ใช่รูปภาพ');
    return;
  }
  const img = new Image();
  try {
    // ใช้ data: URL ไม่ใช่ blob: เพราะ CSP ของ Railway (img-src) ไม่อนุญาต blob:
    img.src = await readAsDataUrl(file);
    await img.decode();
  } catch {
    toast('เปิดรูปนี้ไม่ได้ ลองใช้ไฟล์ JPG หรือ PNG');
    return;
  }
  setImage(img, file.name || 'รูปจากคลิปบอร์ด');
}

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

// ภาพสามเหลี่ยมที่รู้มุมจริง (40°, 65°, 75°) เหมือน demo_measure_angle.m
function loadSample() {
  const t = renderTestTriangle();
  const c = document.createElement('canvas');
  c.width = t.width;
  c.height = t.height;
  c.getContext('2d').putImageData(new ImageData(t.data, t.width, t.height), 0, 0);
  const truth = { vertices: t.vertices.map(fromMatlab), angles: t.trueAngles };
  if (setImage(c, 'ภาพตัวอย่าง: สามเหลี่ยม 40°, 65°, 75°', truth)) {
    toast('ลองวัดมุม A (ซ้ายล่าง), B (ขวาล่าง), C (บน) แล้วเทียบกับค่าจริง');
  }
}

for (const b of document.querySelectorAll('[data-open]')) b.addEventListener('click', () => el.fileInput.click());
for (const b of document.querySelectorAll('[data-sample]')) b.addEventListener('click', loadSample);
el.fileInput.addEventListener('change', () => {
  loadFile(el.fileInput.files[0]);
  el.fileInput.value = '';
});

window.addEventListener('paste', (e) => {
  const item = [...(e.clipboardData?.items ?? [])].find((it) => it.type.startsWith('image/'));
  if (!item) return;
  e.preventDefault();
  loadFile(item.getAsFile());
});

let dragDepth = 0;
const hasFiles = (e) => [...(e.dataTransfer?.types ?? [])].includes('Files');
window.addEventListener('dragenter', (e) => {
  if (!hasFiles(e)) return;
  e.preventDefault();
  dragDepth++;
  el.dropOverlay.hidden = false;
});
window.addEventListener('dragover', (e) => {
  if (hasFiles(e)) e.preventDefault();
});
window.addEventListener('dragleave', (e) => {
  if (hasFiles(e) && --dragDepth <= 0) {
    dragDepth = 0;
    el.dropOverlay.hidden = true;
  }
});
window.addEventListener('drop', (e) => {
  if (!hasFiles(e)) return;
  e.preventDefault();
  dragDepth = 0;
  el.dropOverlay.hidden = true;
  loadFile(e.dataTransfer.files[0]);
});

// ===== บันทึกผล =====
function baseName() {
  if (state.truth) return 'sample-triangle';
  return state.name.replace(/\.[^.]+$/, '').replace(/[\\/:*?"<>|]+/g, '_') || 'image';
}

function download(blob, filename) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}

// รูปพร้อมเส้นและค่ามุม ที่ความละเอียดเต็ม (ย่อลงถ้าใหญ่เกินที่เบราว์เซอร์รับได้)
function exportPng() {
  const f = Math.min(1, Math.sqrt(MAX_EXPORT_PIXELS / (state.w * state.h)));
  const off = document.createElement('canvas');
  off.width = Math.round(state.w * f);
  off.height = Math.round(state.h * f);
  const k = Math.max(1, Math.max(off.width, off.height) / 900);
  drawScene(off.getContext('2d'), { s: f, x: 0, y: 0 }, k, false);
  off.toBlob((blob) => {
    if (blob) download(blob, `${baseName()}-angles.png`);
    else toast('บันทึกรูปไม่สำเร็จ');
  }, 'image/png');
}

function exportCsv() {
  const head = ['No.', 'Vertex_x', 'Vertex_y', 'Arm1_x', 'Arm1_y', 'Arm2_x', 'Arm2_y', 'Angle_deg'];
  if (state.truth) head.push('True_deg', 'Error_deg');
  const rows = state.angles.map((a, i) => {
    const deg = angleOf(a.pts);
    const row = [i + 1, ...a.pts.flatMap((p) => toMatlab(p).map((v) => v.toFixed(2))), deg.toFixed(4)];
    if (state.truth) {
      const truth = truthFor(a);
      row.push(truth ?? '', truth === null ? '' : (deg - truth).toFixed(4));
    }
    return row.join(',');
  });
  const text = '﻿' + [head.join(','), ...rows].join('\r\n');   // BOM ให้ Excel อ่านไฟล์ UTF-8 ถูก
  download(new Blob([text], { type: 'text/csv;charset=utf-8' }), `${baseName()}-angles.csv`);
}

// ===== ปุ่มต่าง ๆ =====
el.btnUndo.addEventListener('click', undo);
$('btnZoomIn').addEventListener('click', () => zoomCenter(1.25));
$('btnZoomOut').addEventListener('click', () => zoomCenter(0.8));
$('btnFit').addEventListener('click', fit);
el.btnLoupe.addEventListener('click', () => {
  state.loupe = !state.loupe;
  el.btnLoupe.setAttribute('aria-pressed', String(state.loupe));
  requestRender();
});
el.btnPng.addEventListener('click', exportPng);
el.btnCsv.addEventListener('click', exportCsv);
el.btnClear.addEventListener('click', clearAll);

el.results.addEventListener('click', (e) => {
  const b = e.target.closest('[data-del]');
  if (b) deleteAngle(Number(b.dataset.del));
});
el.results.addEventListener('pointerover', (e) => {
  const li = e.target.closest('[data-id]');
  const id = li ? Number(li.dataset.id) : null;
  if (id === state.listHover) return;
  state.listHover = id;
  markListHover();
  requestRender();
});
el.results.addEventListener('pointerleave', () => {
  state.listHover = null;
  markListHover();
  requestRender();
});

let toastTimer = 0;
function toast(msg) {
  el.toast.textContent = msg;
  el.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.toast.hidden = true; }, 3200);
}

// ===== เริ่มต้น =====
new ResizeObserver(() => {
  const dpr = window.devicePixelRatio || 1;
  size = { cw: el.stage.clientWidth, ch: el.stage.clientHeight };
  el.canvas.width = Math.round(size.cw * dpr);
  el.canvas.height = Math.round(size.ch * dpr);
  if (state.img && state.fitted) state.view = fitView();
  render();
}).observe(el.stage);

coarsePointer.addEventListener('change', renderPrompt);
document.fonts?.ready.then(requestRender);
renderPanel();
renderPrompt();
