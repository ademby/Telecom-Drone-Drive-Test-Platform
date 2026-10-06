#!/usr/bin/env tsx
/**
 * Drone Cockpit — DEV-ONLY CLI to mock a drone for the Drone Drive-Test Platform.
 *
 * Standalone: one TypeScript file, no dependencies of its own. Runs with `tsx`
 * (already a repo devDependency), Node >= 20 (global fetch + readline).
 * It plays the *drone* side of ADR-0003 (drone-initiated REST):
 *   discover planned missions -> claim -> report status -> upload measurements.
 *
 *   tsx tools/drone-cockpit/drone-cockpit.mts
 *
 * Environment (all optional, all editable from the Settings menu):
 *   BACKEND_URL   default http://localhost:3000
 *   DRONE_ID      default drone-alpha
 *   DEVICE_ID     default mock-device-<droneId>
 *   NO_COLOR      disable ANSI colors
 */
import { randomUUID } from 'node:crypto';
import { createInterface } from 'node:readline';

// ───────────────────────────── types ─────────────────────────────
type MissionState = 'DRAFT' | 'PLANNED' | 'DISPATCHED' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
type ReportedStatus = 'RUNNING' | 'COMPLETED' | 'FAILED';
type FailureReason = 'EXECUTION_FAILED' | 'DATA_INVALID';
type Coord = [lon: number, lat: number];
type Scenario = 'happy' | 'no-upload' | 'fail-claimed' | 'fail-midflight' | 'data-invalid' | 'claim-only';
type SettingsGroup = 'connection' | 'generator' | 'simulation';

interface MissionRoute {
  revision: number;
  geometry: { type: 'LineString'; coordinates: Coord[] };
}
interface Mission {
  id: string;
  name: string;
  droneId: string;
  state: MissionState;
  failureReason?: FailureReason | null;
  earliestStart: string;
  dispatchDeadline: string | null;
  derivedFrom?: string | null;
  activeRoute: MissionRoute;
  routeHistory: MissionRoute[];
}
interface Measurement {
  capturedAt: string;
  longitude: number;
  latitude: number;
  source: string;
  rawObservations: { signalQuality: number };
}
interface MissionResult {
  id: string;
  missionId: string;
  deviceId: string;
  uploadedAt: string;
  measurements: Measurement[];
  activeRevision?: { revision: number; finalizedAt?: string | null; rejectedMeasurementIds: string[] } | null;
  revisionHistory: unknown[];
}
interface Config {
  backend: string;
  droneId: string;
  deviceId: string;
  source: string;
  stepMeters: number;
  speed: number;
  baseline: number;
  noise: number;
  outlierRate: number;
  simSeconds: number;
  pollSeconds: number;
  anchor: Coord;
}

// ───────────────────────────── settings ─────────────────────────────
const cfg: Config = {
  backend: (process.env.BACKEND_URL ?? 'http://localhost:3000').replace(/\/+$/, ''),
  droneId: process.env.DRONE_ID ?? 'drone-alpha',
  deviceId: process.env.DEVICE_ID ?? '',
  source: 'mock-drone-gnss',
  // measurement generator
  stepMeters: 10, //      one sample every N metres of route
  speed: 8, //            m/s, only used for capturedAt spacing
  baseline: 70, //        starting Signal Quality
  noise: 2.4, //          random-walk amplitude per sample
  outlierRate: 0.02, //   share of obviously bad samples (gives the operator something to reject)
  // simulation
  simSeconds: 5, //       wall-clock duration of the simulated flight
  pollSeconds: 3, //      autopilot polling interval
  // dev helper (create & plan a demo mission)
  anchor: [10.1815, 36.8065], // [lon, lat]
};
const deviceId = (): string => cfg.deviceId || `mock-device-${cfg.droneId}`;

// ───────────────────────────── terminal helpers ─────────────────────────────
const useColor = Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;
const paint = (code: string) => (s: unknown): string => (useColor ? `\x1b[${code}m${s}\x1b[0m` : String(s));
const dim = paint('2'), bold = paint('1'), red = paint('31'), green = paint('32'),
  yellow = paint('33'), cyan = paint('36'), magenta = paint('35');
const STATE_COLOR: Record<string, (s: unknown) => string> = {
  DRAFT: dim, PLANNED: cyan, DISPATCHED: yellow, RUNNING: yellow, COMPLETED: green, FAILED: red, CANCELLED: dim,
};
const state = (s: string): string => (STATE_COLOR[s] ?? ((x: unknown) => String(x)))(s);
const ok = (m: string): void => console.log(green('✔ ') + m);
const info = (m: string): void => console.log(cyan('ℹ ') + m);
const warn = (m: string): void => console.log(yellow('! ') + m);
const fail = (m: string): void => console.log(red('✘ ') + m);

// ── Input handling ───────────────────────────────────────────────────────────
// On a real terminal we let readline OWN the TTY (terminal: true): raw mode, echo, line editing and
// Enter handling are done by Node, so input arrives instantly and exactly once per Enter. Using
// `terminal: false` on a TTY leaves the console in cooked mode, where delivery depends on the OS /
// launcher (npm → tsx → node, ConPTY on Windows, IDE terminals) and lines can arrive late or glued
// together — that showed up as "press Enter twice" and bogus "Unknown option".
// Piped stdin (scripts, tests) keeps working through the same line queue.
// Escape hatches:  COCKPIT_PLAIN_IO=1 forces the old non-terminal mode, COCKPIT_DEBUG_IO=1 logs every raw line.
const interactive = Boolean(process.stdin.isTTY) && !process.env.COCKPIT_PLAIN_IO;
const debugIO = Boolean(process.env.COCKPIT_DEBUG_IO);
const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: interactive });
const lines: string[] = [];
const waiters: Array<(l: string | null) => void> = [];
let closed = false;
rl.on('line', (raw: string) => {
  // drop control chars / escape sequences / BOM a flaky terminal layer may inject, keep the text
  const l = raw.replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '').replace(/[\u0000-\u001f\u007f\ufeff]/g, '');
  if (debugIO) console.log(dim(`[io] line ${JSON.stringify(raw)} -> ${JSON.stringify(l)}`));
  const w = waiters.shift();
  if (w) w(l); else lines.push(l);
});
rl.on('SIGINT', () => { process.stdout.write('\n'); rl.close(); }); // Ctrl+C quits cleanly
rl.on('close', () => { closed = true; while (waiters.length) waiters.shift()!(null); });
const nextLine = (): Promise<string | null> =>
  new Promise((res) => {
    const l = lines.shift();
    if (l !== undefined) res(l);
    else if (closed) res(null);
    else waiters.push(res);
  });

class Quit extends Error {}

async function ask(question: string, def?: string | number): Promise<string> {
  // setPrompt/prompt (not a raw stdout.write) so readline knows the prompt width when redrawing the line
  rl.setPrompt(`${question}${def !== undefined && def !== '' ? dim(` [${def}]`) : ''}: `);
  rl.prompt();
  const line = await nextLine();
  if (line === null) { process.stdout.write('\n'); throw new Quit(); }
  const v = line.trim();
  return v === '' && def !== undefined ? String(def) : v;
}
async function askNum(question: string, def: number, { min = -Infinity, max = Infinity } = {}): Promise<number> {
  for (;;) {
    const n = Number(await ask(question, def));
    if (Number.isFinite(n) && n >= min && n <= max) return n;
    warn(`Enter a number between ${min} and ${max}.`);
  }
}
async function confirm(question: string, def = true): Promise<boolean> {
  const a = (await ask(`${question} (y/n)`, def ? 'y' : 'n')).toLowerCase();
  return a.startsWith('y');
}
async function choose<T>(title: string, options: Array<{ label: string; value: T }>): Promise<T> {
  console.log('\n' + bold(title));
  options.forEach((o, i) => console.log(`  ${cyan(i + 1)}) ${o.label}`));
  for (;;) {
    const n = Number(await ask('Choice'));
    if (Number.isInteger(n) && n >= 1 && n <= options.length) return options[n - 1].value;
    warn('Pick one of the numbers above.');
  }
}
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

// ───────────────────────────── HTTP ─────────────────────────────
class ApiFail extends Error {
  readonly status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}
const HINTS: Record<number, string> = {
  0: 'Is the backend running? (npm run dev:backend) Check Settings → backend URL.',
  403: 'The mission is assigned to a different drone. Change the drone id in Settings.',
  404: 'Unknown mission id (or no result uploaded yet).',
  409: 'Conflict: dispatch deadline passed, or a result was already uploaded.',
};

async function api<T = any>(method: string, path: string, { body, key }: { body?: unknown; key?: string } = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (key) headers['Idempotency-Key'] = key;
  let res: Response;
  try {
    res = await fetch(cfg.backend + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch (e) {
    const err = e as Error & { cause?: { code?: string } };
    throw new ApiFail(0, `Cannot reach ${cfg.backend} (${err.cause?.code ?? err.message})`);
  }
  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) {
    const m = data?.error ?? text ?? res.statusText;
    throw new ApiFail(res.status, Array.isArray(m) ? m.join('; ') : String(m));
  }
  return data as T;
}

interface LastCommand { method: string; path: string; body: unknown; key: string; label: string }
let lastCommand: LastCommand | null = null; // for "replay with same Idempotency-Key"

async function command<T = any>(method: string, path: string, body: unknown, label: string): Promise<T> {
  const key = randomUUID();
  lastCommand = { method, path, body, key, label };
  return api<T>(method, path, { body, key });
}

async function guarded<T>(fn: () => Promise<T>): Promise<T | undefined> {
  try { return await fn(); } catch (e) {
    if (e instanceof Quit) throw e;
    if (e instanceof ApiFail) {
      fail(`${e.status ? `HTTP ${e.status}: ` : ''}${e.message}`);
      if (HINTS[e.status]) console.log(dim('  ↳ ' + HINTS[e.status]));
    } else fail((e as Error)?.stack ?? String(e));
    return undefined;
  }
}

// ───────────────────────────── geometry / measurement generator ─────────────────────────────
const M_LAT = 111320;
const mLon = (lat: number): number => M_LAT * Math.cos((lat * Math.PI) / 180);
const segMeters = (a: Coord, b: Coord): number =>
  Math.hypot((b[0] - a[0]) * mLon((a[1] + b[1]) / 2), (b[1] - a[1]) * M_LAT);
const routeLength = (c: Coord[]): number => c.slice(1).reduce((s, p, i) => s + segMeters(c[i], p), 0);

/** Resamples a LineString every `step` metres of real path distance (first point included). */
function sampleRoute(coords: Coord[], step: number): Array<{ lon: number; lat: number }> {
  const out = [{ lon: coords[0][0], lat: coords[0][1] }];
  let carry = 0;
  for (let i = 0; i < coords.length - 1; i += 1) {
    const a = coords[i], b = coords[i + 1];
    const len = segMeters(a, b);
    if (len === 0) continue;
    let d = step - carry;
    while (d <= len) {
      const t = d / len;
      out.push({ lon: a[0] + (b[0] - a[0]) * t, lat: a[1] + (b[1] - a[1]) * t });
      d += step;
    }
    carry = len - (d - step);
  }
  return out;
}

function buildMeasurements(
  mission: Mission,
  { startedAt = new Date(Date.now() - 60_000) } = {},
): { measurements: Measurement[]; length: number; step: number } {
  const coords = mission.activeRoute.geometry.coordinates;
  const length = routeLength(coords);
  let step = cfg.stepMeters;
  const MAX_POINTS = 20_000;
  if (length / step > MAX_POINTS) step = Math.ceil(length / MAX_POINTS);
  const pts = sampleRoute(coords, step);
  let value = cfg.baseline;
  const measurements: Measurement[] = pts.map((p, i) => {
    value = Math.min(99, Math.max(15, value + (Math.random() - 0.5) * cfg.noise));
    const jitter = (Math.random() - 0.5) * 3; // metres of GNSS jitter
    let signal = Math.round(value * 100) / 100;
    if (Math.random() < cfg.outlierRate) signal = Math.random() < 0.5 ? 0 : 140; // obviously bad sample
    return {
      capturedAt: new Date(startedAt.getTime() + (i * step * 1000) / cfg.speed).toISOString(),
      longitude: Number((p.lon + jitter / mLon(p.lat)).toFixed(6)),
      latitude: Number((p.lat + jitter / M_LAT).toFixed(6)),
      source: cfg.source,
      rawObservations: { signalQuality: signal },
    };
  });
  return { measurements, length, step };
}

// ───────────────────────────── presentation ─────────────────────────────
let current: string | null = null; // currently selected mission id
const short = (id: string): string => id.slice(0, 8);
const when = (iso?: string | null): string => (iso ? new Date(iso).toLocaleString() : '—');

function printMissionRow(m: Mission, i: number): void {
  const len = Math.round(routeLength(m.activeRoute.geometry.coordinates));
  const dl = m.dispatchDeadline ? new Date(m.dispatchDeadline) : null;
  const late = dl && dl.getTime() < Date.now() && m.state === 'PLANNED' ? red(' (deadline passed)') : '';
  console.log(
    `  ${cyan(String(i + 1).padStart(2))}) ${short(m.id)}  ${state(m.state.padEnd(10))}  ${m.droneId.padEnd(12)}  ${String(len).padStart(5)} m  ${m.name}${late}`,
  );
}

function printMission(m: Mission): void {
  const c = m.activeRoute.geometry.coordinates;
  console.log(`\n${bold(m.name)}  ${dim(m.id)}`);
  console.log(`  state            ${state(m.state)}${m.failureReason ? red(`  (${m.failureReason})`) : ''}`);
  console.log(`  drone            ${m.droneId}`);
  console.log(`  earliest start   ${when(m.earliestStart)}`);
  console.log(`  dispatch until   ${when(m.dispatchDeadline)}`);
  console.log(`  route            rev ${m.activeRoute.revision}/${m.routeHistory.length}, ${c.length} vertices, ${Math.round(routeLength(c))} m`);
  console.log(`                   start [${c[0]}]  end [${c[c.length - 1]}]`);
  if (m.derivedFrom) console.log(`  derived from     ${m.derivedFrom}`);
}

function header(): void {
  console.log('\n' + magenta('━━━━━━━━━━━━━━  DRONE COCKPIT  (dev-only)  ━━━━━━━━━━━━━━'));
  console.log(`  backend ${bold(cfg.backend)}   drone ${bold(cfg.droneId)}   device ${bold(deviceId())}`);
  console.log(`  current mission: ${current ? bold(current) : dim('none')}`);
}

// ───────────────────────────── mission selection ─────────────────────────────
async function listMissions({ stateFilter, droneFilter }: { stateFilter?: string; droneFilter?: string }): Promise<Mission[]> {
  const q = new URLSearchParams();
  if (stateFilter) q.set('state', stateFilter);
  if (droneFilter) q.set('droneId', droneFilter);
  return api<Mission[]>('GET', `/missions${q.size ? `?${q}` : ''}`);
}

interface PickOpts { stateFilter?: string; droneFilter?: string; allowCurrent?: boolean; title?: string }

/** Lists missions and lets the user pick by number, id or id prefix. Enter = keep current. */
async function pickMission(
  { stateFilter, droneFilter = cfg.droneId, allowCurrent = true, title = 'Missions' }: PickOpts = {},
): Promise<Mission | null> {
  const ms = await listMissions({ stateFilter, droneFilter });
  console.log('\n' + bold(`${title}${stateFilter ? ` [${stateFilter}]` : ''}${droneFilter ? ` for ${droneFilter}` : ''}`));
  if (!ms.length) info('No missions match.');
  ms.forEach(printMissionRow);
  const def = allowCurrent && current ? short(current) : undefined;
  const a = await ask(`Mission (number / id${def ? ' / Enter = current' : ''}, 0 = cancel)`, def);
  if (a === '0' || a === '') return null;
  if (/^\d+$/.test(a) && Number(a) <= ms.length) return ms[Number(a) - 1];
  const hit = ms.find((m) => m.id === a || m.id.startsWith(a));
  if (hit) return hit;
  return api<Mission>('GET', `/missions/${encodeURIComponent(a)}`); // full id typed / pasted
}

async function chooseMission(opts?: PickOpts): Promise<Mission | null> {
  const m = await pickMission(opts);
  if (m) current = m.id;
  return m;
}

// ───────────────────────────── drone operations ─────────────────────────────
async function claim(m: Mission): Promise<Mission> {
  const r = await command<Mission>('POST', `/missions/${m.id}/claim`, { droneId: cfg.droneId }, 'claim');
  ok(`Claimed → ${state(r.state)}  (${r.name})`);
  return r;
}

async function report(m: Mission, status: ReportedStatus, failureReason?: FailureReason): Promise<Mission> {
  const body = { droneId: cfg.droneId, status, ...(failureReason ? { failureReason } : {}) };
  const r = await command<Mission>('POST', `/missions/${m.id}/status`, body, `status ${status}`);
  ok(`Status ${status}${failureReason ? ` (${failureReason})` : ''} → ${state(r.state)}`);
  return r;
}

async function upload(m: Mission): Promise<MissionResult> {
  const { measurements, length, step } = buildMeasurements(m);
  info(`Generated ${measurements.length} measurements over ${Math.round(length)} m (every ${step} m, outliers ${(cfg.outlierRate * 100).toFixed(1)}%).`);
  const r = await command<MissionResult>('POST', `/missions/${m.id}/result`, { deviceId: deviceId(), measurements }, 'upload result');
  ok(`Result uploaded: ${r.measurements.length} measurements, device ${r.deviceId}, revision ${r.activeRevision ? r.activeRevision.revision : 'none yet (awaiting operator review)'}.`);
  return r;
}

async function simulateFlight(fraction = 1, label = 'Flying'): Promise<void> {
  const ms = Math.max(0, cfg.simSeconds * 1000 * fraction);
  const ticks = Math.max(1, Math.round(ms / 200));
  for (let i = 1; i <= ticks; i += 1) {
    await sleep(ms / ticks);
    const pct = Math.round((i / ticks) * 100 * fraction);
    const bar = '█'.repeat(Math.round(pct / 5)).padEnd(20, '░');
    process.stdout.write(`\r  ${label} ${dim('[')}${cyan(bar)}${dim(']')} ${String(pct).padStart(3)}%`);
  }
  process.stdout.write('\n');
}

const SCENARIOS: Array<{ label: string; value: Scenario }> = [
  { label: 'Happy path        claim → RUNNING → fly → COMPLETED → upload', value: 'happy' },
  { label: 'Complete, no upload   (leaves a COMPLETED mission without result)', value: 'no-upload' },
  { label: 'Fail after claim      (EXECUTION_FAILED from DISPATCHED)', value: 'fail-claimed' },
  { label: 'Fail mid-flight       (EXECUTION_FAILED from RUNNING)', value: 'fail-midflight' },
  { label: 'Data invalid at end   (DATA_INVALID from RUNNING)', value: 'data-invalid' },
  { label: 'Claim only            (stay DISPATCHED)', value: 'claim-only' },
];

async function runFlow(m: Mission, scenario: Scenario): Promise<void> {
  console.log('\n' + bold(`▶ ${scenario} — ${m.name}`) + dim(`  ${short(m.id)}`));
  let cur = m.state === 'PLANNED' ? await claim(m) : m;
  if (cur.state === 'PLANNED') return;
  if (scenario === 'claim-only') return;
  if (scenario === 'fail-claimed') { await report(cur, 'FAILED', 'EXECUTION_FAILED'); return; }
  if (cur.state === 'DISPATCHED') cur = await report(cur, 'RUNNING');
  if (scenario === 'fail-midflight') {
    await simulateFlight(0.5);
    await report(cur, 'FAILED', 'EXECUTION_FAILED');
    return;
  }
  await simulateFlight(1);
  if (scenario === 'data-invalid') { await report(cur, 'FAILED', 'DATA_INVALID'); return; }
  cur = await report(cur, 'COMPLETED');
  if (scenario === 'no-upload') return;
  await upload(cur);
}

// ───────────────────────────── menu actions ─────────────────────────────
const actions: Record<string, (arg?: SettingsGroup) => Promise<void>> = {
  async health() {
    const t = Date.now();
    const r = await api('GET', '/health');
    ok(`Backend reachable in ${Date.now() - t} ms: ${JSON.stringify(r)}`);
  },

  async list() {
    const stateFilter = (await ask('State filter (DRAFT/PLANNED/DISPATCHED/RUNNING/COMPLETED/FAILED/CANCELLED, blank = any)', 'PLANNED')).toUpperCase();
    const mine = await confirm(`Only missions assigned to ${cfg.droneId}?`, true);
    const ms = await listMissions({ stateFilter, droneFilter: mine ? cfg.droneId : '' });
    console.log();
    if (!ms.length) info('No missions match.');
    ms.forEach(printMissionRow);
  },

  async show() {
    const m = await chooseMission({ droneFilter: '', title: 'Show mission' });
    if (!m) return;
    printMission(await api<Mission>('GET', `/missions/${m.id}`));
  },

  async claim() {
    const m = await chooseMission({ stateFilter: 'PLANNED', title: 'Claim a planned mission' });
    if (m) await claim(m);
  },

  async status() {
    const m = await chooseMission({ droneFilter: cfg.droneId, title: 'Report status for' });
    if (!m) return;
    printMission(m);
    const status = await choose<ReportedStatus>('Report status', [
      { label: 'RUNNING    (from DISPATCHED)', value: 'RUNNING' },
      { label: 'COMPLETED  (from RUNNING)', value: 'COMPLETED' },
      { label: 'FAILED     (from DISPATCHED or RUNNING)', value: 'FAILED' },
    ]);
    let reason: FailureReason | undefined;
    if (status === 'FAILED') {
      reason = await choose<FailureReason | undefined>('Failure reason', [
        { label: 'EXECUTION_FAILED', value: 'EXECUTION_FAILED' },
        { label: 'DATA_INVALID', value: 'DATA_INVALID' },
        { label: '(none — backend should reject this)', value: undefined },
      ]);
    }
    await report(m, status, reason);
  },

  async upload() {
    const m = await chooseMission({ stateFilter: 'COMPLETED', title: 'Upload result for a COMPLETED mission' });
    if (!m) return;
    if (await confirm('Tweak generator settings first?', false)) await actions.settings('generator');
    await upload(m);
  },

  async result() {
    const m = await chooseMission({ stateFilter: 'COMPLETED', droneFilter: '', title: 'Show result of' });
    if (!m) return;
    const r = await api<MissionResult>('GET', `/missions/${m.id}/result`);
    const vals = r.measurements.map((x) => x.rawObservations.signalQuality).filter(Number.isFinite);
    console.log(`\n${bold('Result')} ${dim(r.id)}  device ${r.deviceId}  uploaded ${when(r.uploadedAt)}`);
    console.log(`  measurements  ${r.measurements.length}` + (vals.length ? `   signalQuality min ${Math.min(...vals)} / avg ${(vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1)} / max ${Math.max(...vals)}` : ''));
    console.log(`  active rev    ${r.activeRevision ? `#${r.activeRevision.revision} ${r.activeRevision.finalizedAt ? green('finalized') : yellow('draft')}, ${r.activeRevision.rejectedMeasurementIds.length} rejected` : dim('none (not reviewed yet)')}`);
    console.log(`  history       ${r.revisionHistory.length} revision(s)`);
  },

  async flow() {
    const m = await chooseMission({ stateFilter: 'PLANNED', title: 'Run a full flight for' });
    if (!m) return;
    const scenario = await choose<Scenario>('Scenario', SCENARIOS);
    await runFlow(m, scenario);
  },

  async autopilot() {
    const scenario = await choose<Scenario>('Autopilot scenario for every claimed mission', SCENARIOS.slice(0, 5));
    info(`Polling every ${cfg.pollSeconds}s for PLANNED missions of ${cfg.droneId}. Press Enter to stop.`);
    let stop = false;
    void nextLine().then(() => { stop = true; });
    while (!stop) {
      await guarded(async () => {
        const planned = await listMissions({ stateFilter: 'PLANNED', droneFilter: cfg.droneId });
        const ready = planned.filter((m) => new Date(m.earliestStart).getTime() <= Date.now());
        const waiting = planned.length - ready.length;
        if (!ready.length) {
          process.stdout.write(`\r  ${dim(`${new Date().toLocaleTimeString()} no mission ready (${waiting} not yet at earliestStart)…`)}   `);
        } else {
          process.stdout.write('\n');
          current = ready[0].id;
          await runFlow(ready[0], scenario);
        }
      });
      for (let i = 0; i < cfg.pollSeconds * 10 && !stop; i += 1) await sleep(100);
    }
    process.stdout.write('\n');
    info('Autopilot stopped.');
  },

  async create() {
    // Dev helper: the operator normally does this in the UI.
    const name = await ask('Mission name', `Mock mission ${new Date().toLocaleTimeString()}`);
    const droneId = await ask('Assigned drone', cfg.droneId);
    const meters = await askNum('Route length (m)', 1500, { min: 20, max: 20000 });
    const deadlineMin = await askNum('Dispatch deadline in minutes (0 = none)', 30, { min: 0 });
    const plan = await confirm('Plan it right away?', true);
    // street-like random route around the configured anchor
    let [lon, lat] = cfg.anchor;
    const coords: Coord[] = [[lon, lat]];
    let heading = Math.random() * Math.PI * 2;
    let covered = 0;
    while (covered < meters) {
      const block = Math.min(meters - covered, 90 + Math.random() * 110);
      heading += (Math.random() - 0.5) * (Math.PI / 3) + (Math.random() < 0.15 ? (Math.random() < 0.5 ? 1 : -1) * (Math.PI / 2.2) : 0);
      lon += (Math.sin(heading) * block) / mLon(lat);
      lat += (Math.cos(heading) * block) / M_LAT;
      coords.push([Number(lon.toFixed(6)), Number(lat.toFixed(6))]);
      covered += block;
    }
    let m = await api<Mission>('POST', '/missions', {
      body: {
        name,
        droneId,
        earliestStart: new Date().toISOString(),
        dispatchDeadline: deadlineMin ? new Date(Date.now() + deadlineMin * 60_000).toISOString() : null,
        geometry: { type: 'LineString', coordinates: coords },
      },
    });
    ok(`Created ${m.id} (${state(m.state)})`);
    if (plan) {
      m = await command<Mission>('POST', `/missions/${m.id}/plan`, undefined, 'plan');
      ok(`Planned → ${state(m.state)}`);
    }
    current = m.id;
  },

  async replay() {
    if (!lastCommand) { warn('Nothing to replay yet.'); return; }
    const { method, path, body, key, label } = lastCommand;
    info(`Replaying "${label}" with the SAME Idempotency-Key ${dim(key)}`);
    const r = await api<any>(method, path, { body, key });
    ok('Backend answered without applying it twice. It returns the CURRENT state of the mission:');
    console.log(dim(`  id ${r.missionId ?? r.id}  state ${r.state ?? '(result payload)'}`));
  },

  async settings(only?: SettingsGroup) {
    const groups: Record<SettingsGroup, () => Promise<void>> = {
      connection: async () => {
        cfg.backend = (await ask('Backend URL', cfg.backend)).replace(/\/+$/, '');
        cfg.droneId = await ask('Drone id', cfg.droneId);
        cfg.deviceId = await ask('Device id (blank = mock-device-<droneId>)', cfg.deviceId);
      },
      generator: async () => {
        cfg.stepMeters = await askNum('Sample every N metres', cfg.stepMeters, { min: 1 });
        cfg.speed = await askNum('Drone speed m/s (timestamps)', cfg.speed, { min: 0.1 });
        cfg.baseline = await askNum('Baseline Signal Quality', cfg.baseline, { min: 0, max: 100 });
        cfg.noise = await askNum('Noise amplitude per sample', cfg.noise, { min: 0 });
        cfg.outlierRate = await askNum('Outlier rate 0..1', cfg.outlierRate, { min: 0, max: 1 });
        cfg.source = await ask('Measurement source label', cfg.source);
      },
      simulation: async () => {
        cfg.simSeconds = await askNum('Simulated flight duration (s)', cfg.simSeconds, { min: 0 });
        cfg.pollSeconds = await askNum('Autopilot poll interval (s)', cfg.pollSeconds, { min: 1 });
      },
    };
    const which = only ?? await choose<SettingsGroup>('Settings', [
      { label: 'Connection (backend, drone id, device id)', value: 'connection' },
      { label: 'Measurement generator', value: 'generator' },
      { label: 'Simulation timing', value: 'simulation' },
    ]);
    await groups[which]();
    ok('Settings updated.');
  },
};

// ───────────────────────────── main loop ─────────────────────────────
const MENU: Array<[key: string, label: string, action: string | null]> = [
  ['1', 'Health check', 'health'],
  ['2', 'List missions', 'list'],
  ['3', 'Show mission details', 'show'],
  ['4', 'Claim a planned mission', 'claim'],
  ['5', 'Report status (RUNNING / COMPLETED / FAILED)', 'status'],
  ['6', 'Upload measurements for a COMPLETED mission', 'upload'],
  ['7', 'View uploaded result', 'result'],
  ['8', 'Run a full flight (scenario)', 'flow'],
  ['9', 'Autopilot: poll, claim & fly automatically', 'autopilot'],
  ['c', 'Create & plan a demo mission  (dev helper, normally the operator does this)', 'create'],
  ['r', 'Replay last command with the same Idempotency-Key', 'replay'],
  ['s', 'Settings', 'settings'],
  ['q', 'Quit', null],
];

async function main(): Promise<void> {
  for (;;) {
    header();
    MENU.forEach(([k, label]) => console.log(`  ${cyan(k)}) ${label}`));
    const choice = (await ask('\n>')).toLowerCase();
    if (choice === '') continue; // stray Enter: just redraw the menu
    if (choice === 'q' || choice === 'quit' || choice === 'exit') break;
    const entry = MENU.find(([k]) => k === choice);
    if (!entry || !entry[2]) { warn('Unknown option.'); continue; }
    const run = actions[entry[2]];
    await guarded(() => run());
  }
}

main()
  .catch((e: unknown) => { if (!(e instanceof Quit)) { console.error(e); process.exitCode = 1; } })
  .finally(() => { rl.close(); console.log(dim('Bye.')); });
