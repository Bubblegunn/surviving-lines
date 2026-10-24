#!/usr/bin/env node
// Renders the two round 13 benchmark figures for the surviving-lines launch post:
//   cover.png  - 1000x420 CSS px at device scale 2 (2000x840 px)
//   figure.png - 700 CSS px wide at device scale 2 (1400 px wide)
//
// No result number is typed into this file. Totals, differences, intervals of
// differences, per-task means and failing-task lists are parsed from
// bench/head-to-head/results/round13-claude-sonnet-5-5/SUMMARY.md. SUMMARY.md prints no
// interval for an arm's own total, so those come from arm-intervals.json, written by
// intervals.py from the same grades with the same bootstrap method; intervals.py
// refuses to write if an observed total disagrees with SUMMARY.md, and this script
// refuses to draw if the two files disagree. The script exits non-zero if a table is
// missing, has the wrong row count, or an arm is unknown.
//
// Usage: node render.mjs [outDir]
//   SUMMARY=<path>      override the results file
//   INTERVALS=<path>    override arm-intervals.json
//   FONT_DIR=<dir>      folder holding the three Fontsource variable woff2 files
//   CHROME=<path>       Chrome binary (headless screenshot, no npm dependency)
// Deterministic for a given Chrome build: fonts are embedded as data URIs and the
// layout is fixed-size; nothing reads the clock or the network.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(process.argv[2] ?? here);
mkdirSync(outDir, { recursive: true });

const REL_SUMMARY = 'bench/head-to-head/results/round13-claude-sonnet-5-5/SUMMARY.md';
const summaryCandidates = [
  process.env.SUMMARY,
  join(here, '../../..', REL_SUMMARY),
  join('/Users/efe/Desktop/Open-Source/projelerim/surviving-lines', REL_SUMMARY),
].filter(Boolean);
const summaryPath = summaryCandidates.find((p) => existsSync(p));
if (!summaryPath) throw new Error(`SUMMARY.md not found; tried ${summaryCandidates.join(', ')}`);
const md = readFileSync(summaryPath, 'utf8');
const intervalsPath = [process.env.INTERVALS, join(here, 'arm-intervals.json')].filter(Boolean).find((p) => existsSync(p));
if (!intervalsPath) throw new Error('arm-intervals.json not found; run intervals.py');
const IV = JSON.parse(readFileSync(intervalsPath, 'utf8'));

const fontCandidates = [process.env.FONT_DIR, join(here, 'fonts'), '/Users/efe/Desktop/portfolio/node_modules/@fontsource-variable'].filter(Boolean);
const FONT_FILES = {
  display: ['bricolage-grotesque', 'bricolage-grotesque-latin-wght-normal.woff2'],
  body: ['newsreader', 'newsreader-latin-wght-normal.woff2'],
  mono: ['jetbrains-mono', 'jetbrains-mono-latin-wght-normal.woff2'],
};
function fontData([pkg, file]) {
  for (const dir of fontCandidates) {
    for (const p of [join(dir, pkg, 'files', file), join(dir, file)]) {
      if (existsSync(p)) return `data:font/woff2;base64,${readFileSync(p).toString('base64')}`;
    }
  }
  throw new Error(`font ${file} not found; set FONT_DIR`);
}

// ---------- data from SUMMARY.md ----------
// Arm names as arms.json of the evidence folder spells them.
const NAMES = {
  ours: 'surviving-lines',
  pp: 'project-pilot 1.0.0',
  ppi: 'project-pilot 1.0.0, invoked',
  hist: 'mcp-git-historian',
  bf: 'busfactor (k41n)',
  base: 'no code-ownership plugin',
};
const ORDER = ['ours', 'pp', 'ppi', 'hist', 'bf', 'base']; // column order of every table in SUMMARY.md

function section(heading) {
  const start = md.indexOf(heading);
  if (start < 0) throw new Error(`heading not found: ${heading}`);
  const next = md.indexOf('\n## ', start + heading.length);
  return md.slice(start, next < 0 ? undefined : next);
}
function parseSet(heading, key, label) {
  const text = section(heading);
  const total = text.match(/^\| Total \| (\d+) \| (.+) \|$/m);
  if (!total) throw new Error(`${heading}: Total row not found`);
  const max = +total[1];
  const vals = total[2].split(' | ').map((x) => x.trim());
  if (vals.length !== 6) throw new Error(`${heading}: expected 6 totals`);
  const rows = ORDER.map((arm, i) => {
    const t = IV[key].arms[arm];
    if (Math.abs(t.total - +vals[i]) > 0.006) throw new Error(`${heading}: ${arm} total ${vals[i]} vs arm-intervals.json ${t.total}`);
    return { arm, name: NAMES[arm], total: +vals[i], totalText: vals[i], lo: t.lo, hi: t.hi, tasks: t.tasks };
  });
  const taskRows = [...text.matchAll(/^\| ([A-Z]{1,2}\d[a-z]?) \| (\d+) \| (.+) \|$/gm)];
  const perTask = taskRows.map((m) => {
    const cells = m[3].split(' | ').map((c) => c.trim());
    if (cells.length !== 6) throw new Error(`${heading}: task ${m[1]} has ${cells.length} cells`);
    const mean = cells.map((c) => (c === '-' ? null : +c.match(/^(\d+\.\d\d)/)[1]));
    return { id: m[1], criteria: +m[2], mean };
  });
  if (perTask.length !== IV[key].tasks) throw new Error(`${heading}: ${perTask.length} task rows`);
  const best = text.match(/^\| ([a-z]+) \(best other\) \| ([+-]\d+\.\d\d) \| \[([+-]\d+\.\d\d), ([+-]\d+\.\d\d)\] \| no \|$/m);
  if (!best) throw new Error(`${heading}: best-other row not found`);
  const failing = text.match(/\*\*Rule B\*\* \(pp and ppi as the better of the two per task\): FAIL\. Tasks failing: ([^\n]+)$/m);
  const failIds = failing ? [...failing[1].matchAll(/([A-Za-z0-9]+) ours/g)].map((m) => m[1]) : [];
  return { key, label, rows, max, perTask, diff: { vs: best[1], value: best[2], lo: best[3], hi: best[4] }, failIds };
}
const sealed = parseSet('## SEALED z (', 'sealed-z', 'sealed');
const pub = parseSet('## PUBLIC (', 'public', 'public');
const date = md.match(/run (\d{4}-\d\d-\d\d), (claude-[a-z0-9-]+) through the Claude Code CLI ([\d.]+)/);
if (!date) throw new Error('run date / model / CLI not found');
const [, runDate, model, cli] = date;
const sortRows = (set) => [...set.rows].sort((a, b) => b.total - a.total);

// ---------- drawing ----------
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const CSS = `
@font-face{font-family:"Bricolage";src:url(${fontData(FONT_FILES.display)}) format("woff2");font-weight:200 800}
@font-face{font-family:"Newsreader";src:url(${fontData(FONT_FILES.body)}) format("woff2");font-weight:200 800}
@font-face{font-family:"JBMono";src:url(${fontData(FONT_FILES.mono)}) format("woff2");font-weight:100 800}
:root{
  --paper:#fcfbf9; --ink:#0e1116; --fg:#23272e; --fg-light:#545a63;
  --mark:#7d828a; --rule:rgba(35,39,46,.14);
  --accent:#1b2fbf; --accent-soft:rgba(27,47,191,.10);
  --font-display:"Bricolage",sans-serif; --font-body:"Newsreader",serif; --font-mono:"JBMono",monospace;
}
*{box-sizing:border-box;margin:0;padding:0}
html,body{background:var(--paper);color:var(--fg);overflow:hidden}
body{position:relative;font-family:var(--font-body);-webkit-font-smoothing:antialiased;text-rendering:geometricPrecision}
.h{font-family:var(--font-display);font-weight:600;color:var(--ink);letter-spacing:-0.01em}
.p{font-family:var(--font-body);color:var(--fg-light)}
.m{font-family:var(--font-mono);font-variant-numeric:tabular-nums}
svg text{font-kerning:normal}
`;
const TOKENS = Object.fromEntries([...CSS.matchAll(/--([a-z-]+):([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
const resolveVars = (s) => s.replace(/="var\(--([a-z-]+)\)"/g, (_, k) => {
  if (!(k in TOKENS)) throw new Error(`unknown token ${k}`);
  return `="${TOKENS[k].replace(/"/g, "'")}"`;
});
function page(w, h, body) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><style>${CSS}
html,body{width:${w}px;height:${h}px}</style></head><body>${resolveVars(body)}</body></html>`;
}

/** One ranked dot-and-interval chart. Axis runs from 0 to the set maximum. */
function chart({ set, x0, y0, labelRight, plotLeft, plotRight, valueRight, rowH, tickStep, labelSize, note }) {
  const rows = sortRows(set);
  const ppt = (plotRight - plotLeft) / set.max;
  const X = (v) => plotLeft + v * ppt;
  const top = y0;
  const bottom = y0 + rows.length * rowH;
  const parts = [];
  const ticks = [];
  for (let v = 0; v < set.max - 1e-9; v += tickStep) if (set.max - v > tickStep * 0.4) ticks.push(v);
  ticks.push(set.max);
  for (const v of ticks) {
    const x = X(v).toFixed(1);
    const isMax = v === set.max;
    parts.push(`<line x1="${x}" x2="${x}" y1="${top - 4}" y2="${bottom + 2}" stroke="${isMax ? 'var(--fg-light)' : 'var(--rule)'}" stroke-width="1" ${isMax ? 'stroke-dasharray="2 3"' : ''}/>`);
    parts.push(`<text x="${x}" y="${bottom + 17}" text-anchor="middle" class="m" font-size="11" fill="var(--fg-light)">${v}</text>`);
  }
  parts.push(`<line x1="${plotLeft}" x2="${plotRight}" y1="${bottom + 2}" y2="${bottom + 2}" stroke="var(--fg-light)" stroke-width="1"/>`);
  if (note) parts.push(`<text x="${plotRight}" y="${bottom + 34}" text-anchor="end" font-family="var(--font-body)" font-size="12.5" fill="var(--fg-light)">${esc(note)}</text>`);
  rows.forEach((r, i) => {
    const cy = top + i * rowH + rowH / 2;
    const ours = r.arm === 'ours';
    const partial = r.tasks < set.perTask.length;
    const col = ours ? 'var(--accent)' : 'var(--mark)';
    if (ours) parts.push(`<rect x="${x0}" y="${(cy - rowH / 2 + 1).toFixed(1)}" width="${valueRight - x0 + 6}" height="${rowH - 2}" rx="3" fill="var(--accent-soft)"/>`);
    parts.push(`<text x="${labelRight}" y="${cy + labelSize * 0.35}" text-anchor="end" font-family="var(--font-display)" font-size="${labelSize}" font-weight="${ours ? 650 : 420}" fill="${ours ? 'var(--accent)' : 'var(--fg)'}">${esc(r.name)}${partial ? ' *' : ''}</text>`);
    const capH = ours ? 8 : 6;
    parts.push(`<line x1="${X(r.lo).toFixed(1)}" x2="${X(r.hi).toFixed(1)}" y1="${cy}" y2="${cy}" stroke="${col}" stroke-width="${ours ? 2 : 1.5}"/>`);
    for (const v of [r.lo, r.hi]) parts.push(`<line x1="${X(v).toFixed(1)}" x2="${X(v).toFixed(1)}" y1="${cy - capH / 2}" y2="${cy + capH / 2}" stroke="${col}" stroke-width="${ours ? 2 : 1.5}"/>`);
    parts.push(`<circle cx="${X(r.total).toFixed(1)}" cy="${cy}" r="${ours ? 5.5 : 4.5}" fill="${partial ? 'var(--paper)' : col}" stroke="${partial ? col : 'var(--paper)'}" stroke-width="${partial ? 1.8 : 1.5}"/>`);
    parts.push(`<text x="${valueRight}" y="${cy + 4}" text-anchor="end" class="m" font-size="${labelSize - 1}" font-weight="${ours ? 700 : 400}" fill="${ours ? 'var(--accent)' : 'var(--fg-light)'}">${r.totalText}</text>`);
  });
  return { svg: parts.join('\n'), X, bottom };
}

const sign = (s) => s.replace(/^\+/, '');
const nameOf = (a) => NAMES[a];
const partialNote = (set) => {
  const p = set.rows.filter((r) => r.tasks < set.perTask.length);
  return p.length ? `* ${p.map((r) => `${r.name} has runs on ${r.tasks} of ${set.perTask.length} tasks (an invoked prompt exists only for those); the other tasks add 0.`).join(' ')}` : '';
};
const lossLine = (set) => {
  // tasks where the best rival of that task is above ours, from the per-task means
  const lost = set.perTask
    .map((t) => ({ id: t.id, ours: t.mean[0], best: Math.max(...t.mean.slice(1).filter((x) => x !== null)) }))
    .filter((t) => t.best > t.ours + 1e-9)
    .map((t) => t.id);
  return lost;
};

// ---------- cover (1000 x 420) ----------
function cover() {
  const W = 1000;
  const H = 420;
  const c = chart({ set: sealed, x0: 24, y0: 98, labelRight: 232, plotLeft: 246, plotRight: 560, valueRight: 604, rowH: 34, tickStep: 5, labelSize: 14.5, note: null });
  // per-task panel: ours, best other arm of the set, and the plain-Claude arm
  const cmp = ['ours', 'ppi', 'base'];
  const colX = [724, 822, 912];
  let rowsSvg = '';
  const ty = 98;
  const th = 34;
  cmp.forEach((a, j) => {
    const head = a === 'ours' ? ['surviving-', 'lines'] : a === 'ppi' ? ['project-pilot', 'invoked'] : ['no code-', 'ownership plugin'];
    head.forEach((line, k) => {
      rowsSvg += `<text x="${colX[j]}" y="${ty - 26 + k * 14}" text-anchor="middle" font-family="var(--font-display)" font-size="12.5" font-weight="${a === 'ours' ? 650 : 420}" fill="${a === 'ours' ? 'var(--accent)' : 'var(--fg)'}">${line}</text>`;
    });
  });
  sealed.perTask.forEach((t, i) => {
    const cy = ty + i * th + th / 2;
    rowsSvg += `<text x="672" y="${cy + 4}" text-anchor="start" class="m" font-size="12.5" fill="var(--fg-light)">${t.id}</text>`;
    const best = Math.max(...cmp.map((a) => t.mean[ORDER.indexOf(a)]));
    cmp.forEach((a, j) => {
      const v = t.mean[ORDER.indexOf(a)];
      const isBest = v === best && v > 0;
      rowsSvg += `<text x="${colX[j]}" y="${cy + 4}" text-anchor="middle" class="m" font-size="14" font-weight="${isBest ? 700 : 400}" fill="${a === 'ours' ? 'var(--accent)' : 'var(--fg)'}">${v.toFixed(2)}</text>`;
    });
    rowsSvg += `<line x1="664" x2="944" y1="${ty + (i + 1) * th}" y2="${ty + (i + 1) * th}" stroke="var(--rule)" stroke-width="1"/>`;
  });
  const lost = lossLine(sealed);
  const body = `
<div class="h" style="position:absolute;left:24px;top:24px;font-size:19px">Sealed set, 5 tasks: total of ${sealed.max}</div>
<div class="p" style="position:absolute;left:24px;top:54px;width:600px;font-size:14px;line-height:1.35;color:var(--fg)">Highest total of six arms, ${sign(sealed.diff.value)} points above ${esc(nameOf(sealed.diff.vs))}; 95% interval of the difference [${sign(sealed.diff.lo)}, ${sign(sealed.diff.hi)}].</div>
<svg width="${W}" height="${H}" style="position:absolute;left:0;top:0">${c.svg}${rowsSvg}</svg>
<div style="position:absolute;left:640px;top:24px;width:1px;height:330px;background:var(--rule)"></div>
<div class="h" style="position:absolute;left:664px;top:24px;font-size:19px">Per task, mean of 3 runs</div>
<div class="p" style="position:absolute;left:664px;top:${ty + 5 * th + 12}px;width:290px;font-size:12.5px;line-height:1.35">Each task has 5 criteria. Bold: highest of these three. ${lost.length ? `The best other arm is above ours on ${lost.join(' and ')}.` : ''}</div>
<div style="position:absolute;left:24px;right:24px;top:${H - 34}px;height:1px;background:var(--rule)"></div>
<div class="p" style="position:absolute;left:24px;top:${H - 25}px;font-size:12.5px;white-space:nowrap">surviving-lines head-to-head, round 13: 5 tasks written by an agent that had not seen the repository, ${esc(model.replace('claude-', '').replace(/-(\d)-(\d)$/, ' $1.$2').replace(/^./, (s) => s.toUpperCase()))}, 3 runs per arm, ${runDate}. These tasks only.</div>
`;
  return { html: page(W, H, body), W, H };
}

// ---------- in-article figure (700 CSS px wide, rendered at 2x) ----------
function figure() {
  const W = 700;
  const rowH = 24;
  const geo = { x0: 20, labelRight: 214, plotLeft: 226, plotRight: 616, valueRight: 678, rowH, labelSize: 13 };
  let y = 24;
  const blocks = [];
  const svgs = [];
  const panel = (set, title, sentence, tickStep, axisNote) => {
    blocks.push(`<div class="h" style="position:absolute;left:20px;top:${y}px;font-size:18px">${title}</div>`);
    y += 28;
    blocks.push(`<div class="p" style="position:absolute;left:20px;top:${y}px;width:650px;font-size:14px;line-height:1.4;color:var(--fg)">${sentence}</div>`);
    y += 62;
    const c = chart({ set, y0: y, tickStep, ...geo, note: axisNote });
    svgs.push(c.svg);
    y = c.bottom + 44;
    const pn = partialNote(set);
    if (pn) {
      blocks.push(`<div class="p" style="position:absolute;left:20px;top:${y - 6}px;width:650px;font-size:12px;line-height:1.35">${esc(pn)}</div>`);
      y += 22;
    }
  };
  const lostS = lossLine(sealed).join(' and ');
  const lostP = lossLine(pub);
  panel(
    sealed,
    `Sealed set: 5 tasks, total of ${sealed.max}`,
    `surviving-lines has the highest total, ${sign(sealed.diff.value)} points above ${esc(nameOf(sealed.diff.vs))}. The 95% interval of that difference is [${sign(sealed.diff.lo)}, ${sign(sealed.diff.hi)}]: above zero, but close to it. On ${esc(lostS)} another arm scored higher.`,
    5,
    `Axis from 0 to the maximum of ${sealed.max}`,
  );
  blocks.push(`<div style="position:absolute;left:20px;right:20px;top:${y - 8}px;height:1px;background:var(--rule)"></div>`);
  y += 14;
  panel(
    pub,
    `Public set: 11 tasks, total of ${pub.max}`,
    `This set was used while the tool was developed, so treat it as weaker evidence. surviving-lines has the highest total, ${sign(pub.diff.value)} points above ${esc(nameOf(pub.diff.vs))}, interval [${sign(pub.diff.lo)}, ${sign(pub.diff.hi)}]. On ${esc(lostP.join(', '))} another arm scored higher.`,
    10,
    `Axis from 0 to the maximum of ${pub.max}`,
  );
  blocks.push(`<div style="position:absolute;left:20px;right:20px;top:${y - 6}px;height:1px;background:var(--rule)"></div>`);
  blocks.push(`<div class="p" style="position:absolute;left:20px;top:${y + 4}px;width:660px;font-size:12.5px;line-height:1.45">Round 13, ${runDate}. ${esc(model.replace('claude-', 'Claude ').replace(/-(\d)-(\d)$/, ' $1.$2').replace(/^Claude s/, 'Claude S'))}, Claude Code CLI ${cli}, 6 arms, 3 runs per arm and task, five-vote model grading. A total is the sum over tasks of the mean criteria passed over the runs. Dots are totals; lines are 95% bootstrap intervals of each total. The tasks are the project's own: the sealed set was written by an agent that had not seen the repository. The result applies to these tasks only.</div>`);
  blocks.push(`<div class="m" style="position:absolute;left:20px;top:${y + 76}px;font-size:11px;color:var(--fg-light)">Data: ${REL_SUMMARY}</div>`);
  const H = y + 100;
  const body = `<svg width="${W}" height="${H}" style="position:absolute;left:0;top:0">${svgs.join('\n')}</svg>${blocks.join('\n')}`;
  return { html: page(W, H, body), W, H };
}

const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
function shoot(name, { html, W, H }) {
  const tmp = mkdtempSync(join(tmpdir(), 'sl-fig-'));
  const htmlPath = join(tmp, `${name}.html`);
  const pngPath = join(outDir, `${name}.png`);
  writeFileSync(htmlPath, html);
  execFileSync(CHROME, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run', '--no-default-browser-check',
    '--force-device-scale-factor=2', `--window-size=${W},${H}`, '--virtual-time-budget=3000',
    '--force-color-profile=srgb', `--screenshot=${pngPath}`, pathToFileURL(htmlPath).href,
  ], { stdio: 'ignore' });
  rmSync(tmp, { recursive: true, force: true });
  console.log(`${pngPath}  ${W * 2}x${H * 2}`);
}

console.log(`data: ${summaryPath}`);
for (const s of [sealed, pub]) {
  console.log(`${s.key} (of ${s.max}): ${sortRows(s).map((r) => `${r.arm} ${r.totalText} [${r.lo.toFixed(2)}, ${r.hi.toFixed(2)}]`).join('; ')}`);
  console.log(`  ours minus ${s.diff.vs}: ${s.diff.value} [${s.diff.lo}, ${s.diff.hi}]; Rule B failing: ${s.failIds.join(', ')}; per-task losses: ${lossLine(s).join(', ')}`);
}
shoot('cover', cover());
shoot('figure', figure());
