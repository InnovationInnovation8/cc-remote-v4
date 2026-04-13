import { listClaudeSessions } from '../src/server/pty-manager.js';
const sessions = listClaudeSessions();
console.log('Total:', sessions.length);
const current = sessions.find(s => s.sessionId?.startsWith('c3fd988b'));
console.log('c3fd988b:', current ? 'FOUND' : 'NOT FOUND');
if (current) {
  console.log(JSON.stringify(current, null, 2));
}
console.log('---first 5---');
for (const s of sessions.slice(0, 5)) {
  console.log('sessionId:', s.sessionId, '| display:', String(s.display || '').slice(0, 40));
}
process.exit(0);
