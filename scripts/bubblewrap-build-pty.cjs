#!/usr/bin/env node
// Automate bubblewrap build (AAB generation) by piping keystore passwords.
const pty = require('node-pty');
const path = require('path');

const twaDir = 'C:\\twa-build\\twa-v2'; // ASCII path to avoid Gradle Japanese-path bug
const KEYSTORE_PW = 'XTDIE22ahWyTmTxC9jbS';
const EXISTING_JDK = 'C:\\Users\\lkoro_mylauje\\.bubblewrap\\jdk\\jdk-17.0.11+9';
const EXISTING_SDK = 'C:\\Users\\lkoro_mylauje\\.bubblewrap\\android_sdk';

// License prompts may repeat (multiple licenses); mark with `repeat: true`
const prompts = [
  { tag: 'ApplyChanges', match: /changes in twa-manifest.+apply/i, answer: 'Y' },
  { tag: 'VersionName',  match: /versionName for the new App/i, answer: '1.0.0' },
  { tag: 'VersionCode',  match: /versionCode for the new App/i, answer: '1' },
  { tag: 'LicenseAccept', match: /Accept\?\s*\(y\/N\)/i, answer: 'y', repeat: true },
  { tag: 'ReviewAgreement', match: /Review.+License.+\(y\/N\)/i, answer: 'y', repeat: true },
  { tag: 'KeyStorePw', match: /Password for the Key Store/i, answer: KEYSTORE_PW },
  { tag: 'KeyPw',      match: /Password for the Key\b/i, answer: KEYSTORE_PW },
];

const envWithPath = {
  ...process.env,
  FORCE_COLOR: '0',
  PATH: `${twaDir};${EXISTING_JDK}\\bin;${EXISTING_SDK}\\platform-tools;${EXISTING_SDK}\\build-tools;${process.env.PATH}`,
  JAVA_HOME: EXISTING_JDK,
  ANDROID_HOME: EXISTING_SDK,
  ANDROID_SDK_ROOT: EXISTING_SDK,
};

const term = pty.spawn('bubblewrap.cmd', ['build'], {
  name: 'xterm-256color',
  cols: 140,
  rows: 40,
  cwd: twaDir,
  env: envWithPath,
});

let buffer = '';
let answering = false;
const handled = new Set();

const tryMatch = () => {
  if (answering) return;
  for (let i = 0; i < prompts.length; i++) {
    const { tag, match, answer, repeat } = prompts[i];
    if (!repeat && handled.has(i)) continue;
    if (match.test(buffer)) {
      answering = true;
      if (!repeat) handled.add(i);
      setTimeout(() => {
        term.write(answer + '\r');
        const show = /Pw/.test(tag) ? 'password piped' : answer;
        console.log(`\n[AUTO] [${tag}] → ${show}`);
        buffer = '';
        setTimeout(() => { answering = false; }, 500);
      }, 600);
      return;
    }
  }
};

term.onData((data) => {
  process.stdout.write(data);
  buffer += data;
  if (buffer.length > 4000) buffer = buffer.slice(-2000);
  tryMatch();
});

setInterval(tryMatch, 1500);

term.onExit(({ exitCode }) => {
  console.log(`\n[AUTO] bubblewrap build exited with code ${exitCode}.`);
  process.exit(exitCode || 0);
});

// AAB build can take 5-10 minutes
setTimeout(() => {
  console.error(`\n[AUTO] Timeout after 15 minutes.`);
  term.kill();
  process.exit(1);
}, 15 * 60 * 1000);
