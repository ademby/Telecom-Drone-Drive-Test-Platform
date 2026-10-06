import { spawn } from 'node:child_process';

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const services = [
  ['frontend', ['run', 'dev:frontend']],
  ['backend', ['run', 'dev:backend']],
  ['drone-cockpit', ['run', 'drone:cockpit']],
];

const children = new Map();
let shuttingDown = false;

// Each service (npm -> sh -> nest -> {tsc --watch, node --watch ...}) is several process
// hops deep. Killing only the direct npm child relies on every hop relaying the signal
// correctly, which isn't guaranteed (Nest's own watch sub-processes are a common leak).
// `detached: true` makes each child its own process-group leader; killing `-pid` (negative)
// sends the signal to that whole group in one shot, reaching every descendant.
function killGroup(pid, signal) {
  try {
    process.kill(-pid, signal);
  } catch (error) {
    if (error?.code !== 'ESRCH') throw error;
  }
}

function stopAll(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children.values()) killGroup(child.pid, 'SIGTERM');
  setTimeout(() => {
    // Anything still alive after the grace period gets SIGKILL'd, group-wide.
    for (const child of children.values()) killGroup(child.pid, 'SIGKILL');
    process.exit(code);
  }, 1500);
}

for (const [name, args] of services) {
  const child = spawn(npm, args, { stdio: 'inherit', env: process.env, detached: process.platform !== 'win32' });
  children.set(name, child);
  child.on('exit', (code, signal) => {
    children.delete(name);
    if (!shuttingDown && (code ?? 1) !== 0) {
      console.error(`[dev] ${name} exited (${signal ?? code}); stopping platform.`);
      stopAll(code ?? 1);
    }
  });
}

process.on('SIGINT', () => stopAll());
process.on('SIGTERM', () => stopAll());
// Covers the case where this process itself is killed abruptly rather than signaled
// normally (e.g. the parent shell/terminal tearing down): best-effort, synchronous only.
process.on('exit', () => {
  for (const child of children.values()) killGroup(child.pid, 'SIGKILL');
});
