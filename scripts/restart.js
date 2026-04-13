// restart.js — Kill old server on PORT, then start fresh
// Usage: node scripts/restart.js
import 'dotenv/config';
import { execSync, spawn } from 'child_process';

const PORT = process.env.PORT || 3737;

// Find and kill process on our port (Windows netstat)
try {
  const out = execSync(`netstat -ano | findstr ":${PORT}"`, { encoding: 'utf-8' });
  const pids = new Set();
  for (const line of out.split('\n')) {
    const m = line.match(/LISTENING\s+(\d+)/);
    if (m) pids.add(m[1]);
  }
  for (const pid of pids) {
    console.log(`[restart] Killing PID ${pid} on port ${PORT}`);
    try { execSync(`taskkill /PID ${pid} /F`, { encoding: 'utf-8' }); } catch {}
  }
  if (pids.size > 0) {
    // Wait a moment for port to free
    execSync('timeout /t 1 /nobreak > nul 2>&1', { shell: true });
  }
} catch {
  // No process on port — fine
}

console.log(`[restart] Starting server on port ${PORT}...`);
const child = spawn('node', ['src/server/index.js'], {
  stdio: 'inherit',
  cwd: new URL('..', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1'),
});

child.on('exit', (code) => process.exit(code ?? 1));
