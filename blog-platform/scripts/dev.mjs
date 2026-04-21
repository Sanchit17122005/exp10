import { spawn } from 'node:child_process';

const processes = [
  spawn('npm', ['run', 'server'], { stdio: 'inherit' }),
  spawn('npm', ['run', 'client'], { stdio: 'inherit' })
];

const shutdown = (code = 0) => {
  for (const child of processes) {
    if (!child.killed) child.kill('SIGTERM');
  }
  process.exit(code);
};

for (const child of processes) {
  child.on('exit', (code) => {
    if (code && code !== 0) shutdown(code);
  });
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
