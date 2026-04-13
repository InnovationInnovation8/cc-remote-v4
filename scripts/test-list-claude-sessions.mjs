// Standalone verification of listClaudeSessions() reading ~/.claude/projects/
// Rev 4 Follow-up US-006: confirms the function returns non-empty when projects exist.
import { listClaudeSessions } from '../src/server/pty-manager.js';

const sessions = listClaudeSessions();
console.log(`listClaudeSessions returned ${sessions.length} sessions`);
if (sessions.length > 0) {
  console.log('First 3 sessions:');
  for (const s of sessions.slice(0, 3)) {
    console.log(`  - ${s.id} cwd=${s.cwd || '?'} timestamp=${s.timestamp || '?'} summary=${String(s.summary || s.firstUserMessage || '').slice(0, 60)}`);
  }
  console.log('PASS');
  process.exit(0);
} else {
  console.log('FAIL: listClaudeSessions returned empty');
  process.exit(1);
}
