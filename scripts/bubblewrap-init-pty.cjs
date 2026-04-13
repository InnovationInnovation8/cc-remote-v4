#!/usr/bin/env node
// Automate interactive bubblewrap init using node-pty.
// Strategy: use loose regex patterns that match just the prompt label,
// and process prompts in strict sequence (one at a time).
const pty = require('node-pty');
const path = require('path');

const root = path.join(__dirname, '..');
const KEYSTORE_PW = 'XTDIE22ahWyTmTxC9jbS';
const EXISTING_JDK = 'C:\\Users\\lkoro_mylauje\\.bubblewrap\\jdk\\jdk-17.0.11+9';
const EXISTING_SDK = 'C:\\Users\\lkoro_mylauje\\.bubblewrap\\android_sdk';

// Ordered prompts with LOOSE regex. Each only tried in order.
// `answer: ''` sends just Enter to accept default.
const prompts = [
  // Environment setup (usually skipped if doctor was run)
  { tag: 'JDK-install',   match: /install the JDK/i, answer: 'N' },
  { tag: 'JDK-path',      match: /Path to your existing JDK/i, answer: EXISTING_JDK },
  { tag: 'SDK-install',   match: /install the Android/i, answer: 'N' },
  { tag: 'SDK-path',      match: /Path to your existing Android SDK/i, answer: EXISTING_SDK },
  // Directory creation
  { tag: 'dir-create',    match: /Do you want to create it now/i, answer: 'Y' },

  // Web App Details section (1/5)
  { tag: 'Domain',        match: /\? Domain:/i, answer: 'cc-remote-api-701345803309.asia-northeast1.run.app' },
  { tag: 'URL-path',      match: /\? URL path:/i, answer: '/' },

  // App Identity section (2/5)
  { tag: 'AppName',       match: /\? Application name:/i, answer: 'CC Remote' },
  { tag: 'ShortName',     match: /\? Short name:/i, answer: 'CC Remote' },
  { tag: 'AppId',         match: /\? Application ID:/i, answer: 'com.ccremote.app' },
  { tag: 'Version',       match: /\? Starting version code/i, answer: '1' },
  { tag: 'DisplayMode',   match: /\? Display mode:/i, answer: '' },
  { tag: 'Orientation',   match: /\? Orientation:/i, answer: '' },

  // Launch appearance (3/5)
  { tag: 'ThemeColor',    match: /\? Theme color:/i, answer: '#0070ec' },
  { tag: 'DarkThemeColor',match: /\? Theme color \(Dark\):/i, answer: '' },
  { tag: 'BgColor',       match: /\? Background color:/i, answer: '#0a0e27' },
  { tag: 'Splash-color',  match: /\? Splash.+color:/i, answer: '#0a0e27' },
  { tag: 'Splash-fade',   match: /Splash.+fade/i, answer: '300' },

  // Icons (4/5) — loose match
  { tag: 'IconUrl',       match: /\? Icon URL:/i, answer: '' },
  { tag: 'MaskIconUrl',   match: /\? Maskable icon URL:/i, answer: '' },
  { tag: 'MonoIconUrl',   match: /\? Monochrome icon URL:/i, answer: '' },

  // Additional Features (5/5)
  { tag: 'Shortcuts',     match: /\? Shortcuts:/i, answer: '' },
  { tag: 'PlayBilling',   match: /Play Billing/i, answer: 'N' },
  { tag: 'Geolocation',   match: /geolocation permission/i, answer: 'N' },
  { tag: 'StatusBar',     match: /\? Status Bar color/i, answer: '#0a0e27' },
  { tag: 'NavColor',      match: /\? Navigation Color/i, answer: '#0a0e27' },
  { tag: 'NavDivColor',   match: /\? Navigation Color Divider/i, answer: '#0a0e27' },
  { tag: 'NavDarkColor',  match: /\? Navigation Color Dark/i, answer: '#0a0e27' },
  { tag: 'NavDarkDivColor', match: /\? Navigation Color Dark Divider/i, answer: '#0a0e27' },

  // Signing Key Info
  { tag: 'KeyStoreLoc',   match: /Key store location/i, answer: './twa-v2/cc-remote.keystore' },
  { tag: 'KeyName',       match: /Key name/i, answer: 'cc-remote' },
  { tag: 'KeyCreate',     match: /Do you want to create one now/i, answer: 'Y' },
  { tag: 'KeyStorePw',    match: /Password for the Key Store/i, answer: KEYSTORE_PW },
  { tag: 'KeyPw',         match: /Password for the Key\b/i, answer: KEYSTORE_PW },
  { tag: 'PasswordConfirm', match: /Confirm password/i, answer: KEYSTORE_PW },
  { tag: 'Password-retype', match: /re-enter|re-type/i, answer: KEYSTORE_PW },

  // Distinguished Name (if key needs creation) — inquirer prompts typically
  { tag: 'DN-CN',         match: /First and Last|full name|Common Name/i, answer: 'CC Remote' },
  { tag: 'DN-OU',         match: /Organizational Unit/i, answer: 'Development' },
  { tag: 'DN-O',          match: /Organization/i, answer: 'Innovationinnovation8' },
  { tag: 'DN-L',          match: /City or Locality|Locality/i, answer: 'Osaka' },
  { tag: 'DN-ST',         match: /State or Province/i, answer: 'Osaka' },
  { tag: 'DN-C',          match: /\? Country/i, answer: 'JP' },
  { tag: 'DN-confirm',    match: /Is.+correct/i, answer: 'yes' },
];

const envWithPath = {
  ...process.env,
  FORCE_COLOR: '0',
  PATH: `${EXISTING_JDK}\\bin;${process.env.PATH}`,
  JAVA_HOME: EXISTING_JDK,
};

const term = pty.spawn('bubblewrap.cmd', [
  'init',
  '--manifest', 'http://127.0.0.1:8787/manifest.json',
  '--directory', './twa-v2',
], {
  name: 'xterm-256color',
  cols: 140,
  rows: 40,
  cwd: root,
  env: envWithPath,
});

let buffer = '';
let answering = false;
const handled = new Set();

const tryMatch = () => {
  if (answering) return;
  // Scan ALL unhandled prompts, pick first that matches the current buffer.
  // This tolerates out-of-order / skipped prompts.
  for (let i = 0; i < prompts.length; i++) {
    if (handled.has(i)) continue;
    const { tag, match, answer } = prompts[i];
    if (match.test(buffer)) {
      answering = true;
      handled.add(i);
      setTimeout(() => {
        term.write(answer + '\r');
        const shown = answer || '<Enter>';
        console.log(`\n[AUTO] [${tag}] → "${shown.substring(0, 40)}" (${handled.size}/${prompts.length})`);
        buffer = '';
        setTimeout(() => { answering = false; }, 300);
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

// Polling fallback in case onData doesn't re-fire between prompts
setInterval(tryMatch, 1500);

term.onExit(({ exitCode }) => {
  console.log(`\n[AUTO] bubblewrap init exited with code ${exitCode}. Handled ${handled.size}/${prompts.length} prompts.`);
  process.exit(exitCode || 0);
});

setTimeout(() => {
  console.error(`\n[AUTO] Timeout after 8 minutes. Handled ${handled.size}/${prompts.length} prompts.`);
  term.kill();
  process.exit(1);
}, 8 * 60 * 1000);
