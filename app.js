const $ = (id) => document.getElementById(id);
const COLORS = { danger: "#d9363e", attention: "#e8821a", normal: "#1f9d64" };
const LABEL = { danger: "Danger", attention: "Attention", normal: "Normal" };
const STALE_MS = 15000;      // sans nouvelle mesure depuis 15 s : "aucune mesure"
const SCALE_MAX = 40;        // la scène affiche 0 à 40 cm
const TRACK_X = 118, TRACK_W = 640;
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

let rows = [], filter = "all", shown = null, raf = 0;

/* ---------- Écran LCD 20x4 (même texte que le code Arduino) ---------- */
const lcdCells = [];
(function buildLcd() {
  const lcd = $("lcd");
  for (let r = 0; r < 4; r++) {
    const row = document.createElement("div");
    row.className = "lcd-row";
    lcdCells[r] = [];
    for (let c = 0; c < 20; c++) {
      const cell = document.createElement("span");
      cell.className = "lcd-cell";
      row.appendChild(cell);
      lcdCells[r][c] = cell;
    }
    lcd.appendChild(row);
  }
})();
function setLcd(line1, line2) {
  [line1 || "", line2 || "", "", ""].forEach((text, r) => {
    for (let c = 0; c < 20; c++) lcdCells[r][c].textContent = text[c] && text[c] !== " " ? text[c] : "";
  });
}

/* ---------- Règle graduée de la scène ---------- */
(function buildTicks() {
  const NS = "http://www.w3.org/2000/svg";
  [0, 5, 10, 20, 30, 40].forEach((cm) => {
    const x = TRACK_X + (cm / SCALE_MAX) * TRACK_W;
    const t = document.createElementNS(NS, "line");
    t.setAttribute("x1", x); t.setAttribute("x2", x);
    t.setAttribute("y1", 228); t.setAttribute("y2", 236);
    const l = document.createElementNS(NS, "text");
    l.setAttribute("x", x); l.setAttribute("y", 254);
    l.textContent = cm === 40 ? "40+ cm" : cm + (cm === 0 ? "" : "");
    $("ticks").append(t, l);
  });
})();

function placeScene(v) {
  const x = TRACK_X + (Math.min(Math.max(v, 0), SCALE_MAX) / SCALE_MAX) * TRACK_W;
  $("obj").setAttribute("transform", `translate(${x} 0)`);
  $("dimLine").setAttribute("x2", x);
  $("dimLabel").setAttribute("x", (TRACK_X + x) / 2);
  $("dimLabel").textContent = Math.round(v) + " cm";
}
function moveTo(target) {
  cancelAnimationFrame(raf);
  const from = shown == null ? target : shown, t0 = performance.now();
  const dur = reduceMotion ? 0 : 500;
  const step = (now) => {
    const k = dur ? Math.min(1, (now - t0) / dur) : 1;
    shown = from + (target - from) * (1 - Math.pow(1 - k, 3));
    placeScene(shown);
    if (k < 1) raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);
}

/* ---------- Utilitaires ---------- */
const pad2 = (n) => String(n).padStart(2, "0");
const fmtDate = (v) => new Date(v).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" });
const fmtTime = (v) => { const d = new Date(v); return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`; };
function fmtAge(ms) {
  const s = Math.round(ms / 1000);
  if (s < 60) return s + " s";
  if (s < 3600) return Math.floor(s / 60) + " min";
  return Math.floor(s / 3600) + " h";
}
function setConn(kind, text) {
  $("connDot").className = "dot " + kind;
  $("connText").textContent = text;
}

/* ---------- Affichage principal ---------- */
const DESCRIPTIONS = {
  danger: "Objet à moins de 5 cm",
  attention: "Objet entre 5 et 10 cm",
  normal: "Plus de 10 cm, aucun danger"
};
const LCD_TITLES = { danger: "ATTENTION !", attention: "DOUCEMENT", normal: "PAS DE DANGER" };
const BUZZER = {
  danger: ["continu à 500 Hz", "cont"],
  attention: ["intermittent", "inter"],
  normal: ["silencieux", ""]
};

function render(data) {
  rows = data.measurements;
  const latest = rows[0];
  const age = latest ? new Date(data.now) - new Date(latest.measured_at) : Infinity;
  const stale = age > STALE_MS;
  const stage = $("stage");

  let status = null;
  if (!latest) {
    stage.className = "stage waiting";
    $("currentDistance").textContent = "—";
    $("stateText").textContent = "En attente de la première mesure";
    $("lastSeen").textContent = "Lance le pont USB sur l'ordinateur relié à l'Arduino.";
    setConn("stale", "Aucune mesure reçue");
    setLcd("AUCUNE MESURE");
  } else {
    status = stale ? null : latest.status;
    stage.className = "stage " + (stale ? "stale" : latest.status);
    $("currentDistance").textContent = latest.distance_cm;
    $("stateText").textContent = stale ? "Aucune mesure récente" : DESCRIPTIONS[latest.status];
    $("lastSeen").textContent = stale
      ? "Dernière mesure il y a " + fmtAge(age) + " : " + latest.distance_cm + " cm"
      : "Mesure du " + fmtDate(latest.measured_at);
    moveTo(latest.distance_cm);
    setConn(stale ? "stale" : "live", stale ? "Aucune mesure depuis " + fmtAge(age) : "Mesures en direct");
    if (stale) setLcd("AUCUNE MESURE");
    else setLcd(LCD_TITLES[latest.status], "Distance : " + latest.distance_cm + " cm");
  }

  $("ledRed").classList.toggle("on", status === "danger");
  $("ledOrange").classList.toggle("on", status === "attention");
  $("ledGreen").classList.toggle("on", status === "normal");
  const [btxt, bcls] = status ? BUZZER[status] : ["silencieux", ""];
  $("buzzerText").textContent = btxt;
  $("buzzerIcon").className = "buzz-icon " + bcls;

  $("chartChip").textContent = rows.length + " dernière" + (rows.length > 1 ? "s mesures" : " mesure");
  renderTable();
  drawChart();
}

function renderTable() {
  const list = filter === "all" ? rows : rows.filter((m) => m.status === filter);
  $("rowsBody").innerHTML = list.length
    ? list.map((m) => `<tr><td>${m.id}</td><td>${fmtDate(m.measured_at)}</td><td class="dist">${m.distance_cm} cm</td><td><span class="tag ${m.status}">${LABEL[m.status]}</span></td></tr>`).join("")
    : '<tr><td colspan="4" class="empty-cell">Aucune mesure ne correspond à ce filtre.</td></tr>';
}

/* ---------- Graphique avec zones de danger ---------- */
function drawChart() {
  const canvas = $("chart"), ctx = canvas.getContext("2d");
  const rect = canvas.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, rect.width * dpr);
  canvas.height = Math.max(1, rect.height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const w = rect.width, h = rect.height;
  ctx.clearRect(0, 0, w, h);
  const data = [...rows].reverse();
  $("emptyChart").hidden = data.length > 0;
  if (!data.length) return;

  const p = { l: 34, r: 10, t: 10, b: 26 };
  const cw = w - p.l - p.r, ch = h - p.t - p.b;
  const max = Math.max(20, Math.ceil(Math.max(...data.map((d) => d.distance_cm)) / 10) * 10);
  const y = (v) => p.t + ch - (Math.min(v, max) / max) * ch;

  ctx.fillStyle = "rgba(217,54,62,.13)"; ctx.fillRect(p.l, y(5), cw, y(0) - y(5));
  ctx.fillStyle = "rgba(232,130,26,.15)"; ctx.fillRect(p.l, y(10), cw, y(5) - y(10));

  ctx.font = "12px 'Instrument Sans', system-ui, sans-serif";
  ctx.strokeStyle = "#d3dbd8"; ctx.fillStyle = "#4b5f6b"; ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const v = (max * i) / 4, yy = y(v);
    ctx.beginPath(); ctx.moveTo(p.l, yy); ctx.lineTo(w - p.r, yy); ctx.stroke();
    ctx.textAlign = "right"; ctx.fillText(String(Math.round(v)), p.l - 6, yy + 4);
  }
  const pts = data.map((d, i) => ({ x: p.l + (data.length === 1 ? cw / 2 : (i * cw) / (data.length - 1)), y: y(d.distance_cm), s: d.status }));
  ctx.beginPath();
  pts.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)));
  ctx.strokeStyle = "#13242f"; ctx.lineWidth = 2; ctx.lineJoin = "round"; ctx.stroke();
  const r = data.length > 60 ? 2.5 : 3.5;
  pts.forEach((q) => { ctx.beginPath(); ctx.arc(q.x, q.y, r, 0, Math.PI * 2); ctx.fillStyle = COLORS[q.s]; ctx.fill(); });

  ctx.fillStyle = "#4b5f6b"; ctx.textAlign = "left"; ctx.fillText(fmtTime(data[0].measured_at), p.l, h - 7);
  ctx.textAlign = "right"; ctx.fillText(fmtTime(data[data.length - 1].measured_at), w - p.r, h - 7);
}

/* ---------- Statistiques 24 h ---------- */
function renderStats(s) {
  $("totalChip").textContent = s.total + " mesure" + (s.total > 1 ? "s" : "") + " en base";
  const has = s.count > 0;
  $("sMin").innerHTML = has ? `${s.min}<small>cm</small>` : "—";
  $("sMax").innerHTML = has ? `${s.max}<small>cm</small>` : "—";
  $("sAvg").innerHTML = has ? `${String(s.avg).replace(".", ",")}<small>cm</small>` : "—";
  $("sCount").textContent = has ? s.count : "—";
  const bars = $("split").children;
  const pct = (n) => (has ? (n / s.count) * 100 : 0) + "%";
  bars[0].style.width = pct(s.danger); bars[1].style.width = pct(s.attention); bars[2].style.width = pct(s.normal);
  const share = (n) => Math.round((n / s.count) * 100) + " %";
  $("splitLegend").textContent = has
    ? `Danger ${share(s.danger)}, attention ${share(s.attention)}, normal ${share(s.normal)} des mesures.`
    : "Aucune mesure sur la période.";
}

/* ---------- Chargement ---------- */
async function refresh() {
  try {
    const r = await fetch("/api/measurements?limit=100", { cache: "no-store" });
    if (!r.ok) throw new Error("serveur");
    render(await r.json());
  } catch {
    setConn("off", "Serveur injoignable");
  }
}
async function refreshStats() {
  try {
    const r = await fetch("/api/stats", { cache: "no-store" });
    if (r.ok) renderStats(await r.json());
  } catch { /* les statistiques se rafraîchiront au prochain tour */ }
}

$("filters").addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  filter = b.dataset.f;
  [...$("filters").children].forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
  renderTable();
});

setLcd("AUCUNE MESURE");
placeScene(0);
refresh(); refreshStats();
setInterval(refresh, 2000);
setInterval(refreshStats, 10000);
window.addEventListener("resize", drawChart);
