#!/usr/bin/env node
// Automate interactive bubblewrap init by responding to prompts via regex
import { spawn } from 'child_process';
import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
const root = join(__dir, '..');
const KEYSTORE_PW = 'XTDIE22ahWyTmTxC9jbS';

const EXISTING_JDK = 'C:\\Users\\lkoro_mylauje\\.bubblewrap\\jdk\\jdk-17.0.11+9';
const EXISTING_SDK = 'C:\\Users\\lkoro_mylauje\\.bubblewrap\\android_sdk';

const responses = [
  { pattern: /Do you want Bubblewrap to install the JDK/i, answer: 'N' },
  { pattern: /Path to your existing JDK/i, answer: EXISTING_JDK },
  { pattern: /Do you want Bubblewrap to install the Android/i, answer: 'N' },
  { pattern: /Path to your existing Android SDK/i, answer: EXISTING_SDK },
  { pattern: /Domain being opened in the TWA/i, answer: '' },
  { pattern: /URL path/i, answer: '' },
  { pattern: /Application name/i, answer: '' },
  { pattern: /Short name/i, answer: '' },
  { pattern: /Application package name/i, answer: '' },
  { pattern: /Display mode/i, answer: '' },
  { pattern: /Orientation/i, answer: '' },
  { pattern: /Status bar color/i, answer: '' },
  { pattern: /Splash screen color/i, answer: '' },
  { pattern: /Navigation bar color/i, answer: '' },
  { pattern: /Starting URL/i, answer: '' },
  { pattern: /Icon URL/i, answer: '' },
  { pattern: /Maskable icon URL/i, answer: '' },
  { pattern: /Monochrome icon URL/i, answer: '' },
  { pattern: /Shortcuts/i, answer: '' },
  { pattern: /Include support for Play Billing/i, answer: 'N' },
  { pattern: /Request geolocation permission/i, answer: 'N' },
  { pattern: /Key store location/i, answer: '' },
  { pattern: /Key name/i, answer: '' },
  { pattern: /use an existing key store/i, answer: 'Y' },
  { pattern: /create a new key/i, answer: 'Y' },
  { pattern: /Password for the Key Store/i, answer: KEYSTORE_PW },
  { pattern: /Password for the Key/i, answer: KEYSTORE_PW },
  { pattern: /keystore password/i, answer: KEYSTORE_PW },
  { pattern: /key password/i, answer: KEYSTORE_PW },
  { pattern: /First and Last name/i, answer: 'CC Remote' },
  { pattern: /Organizational Unit/i, answer: 'Development' },
  { pattern: /Organization/i, answer: 'Innovationinnovation8' },
  { pattern: /Country/i, answer: 'JP' },
  { pattern: /State or Province/i, answer: 'Osaka' },
  { pattern: /City or Locality/i, answer: 'Osaka' },
];

const proc = spawn('bubblewrap.cmd', ['init', '--config', './twa-config.json', '--directory', './twa-v2', '--skipPwaValidation'], {
  cwd: root,
  shell: true,
  stdio: ['pipe', 'pipe', 'pipe'],
});

let buffer = '';
const recentAnswers = new Set();

const handleChunk = (chunk) => {
  const str = chunk.toString();
  process.stdout.write(str);
  buffer += str;
  // Keep buffer manageable
  if (buffer.length > 4000) buffer = buffer.slice(-2000);

  for (const { pattern, answer } of responses) {
    if (pattern.test(buffer)) {
      const key = pattern.toString() + ':' + buffer.length;
      if (!recentAnswers.has(key)) {
        recentAnswers.add(key);
        setTimeout(() => {
          proc.stdin.write(answer + '\n');
          console.log(`\n[AUTO] Answered "${answer.substring(0, 20)}..." for prompt matching ${pattern}`);
        }, 200);
        buffer = ''; // clear after response
        break;
      }
    }
  }
};

proc.stdout.on('data', handleChunk);
proc.stderr.on('data', handleChunk);

proc.on('close', (code) => {
  console.log(`\n[AUTO] bubblewrap init exited with code ${code}`);
  process.exit(code);
});

proc.on('error', (err) => {
  console.error(`[AUTO] Error: ${err.message}`);
  process.exit(1);
});

// Safety timeout
setTimeout(() => {
  console.error('[AUTO] Timeout after 5 minutes, killing process');
  proc.kill();
  process.exit(1);
}, 5 * 60 * 1000);
