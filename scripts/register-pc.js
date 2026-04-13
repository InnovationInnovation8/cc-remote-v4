#!/usr/bin/env node
// Register this PC with the cloud-server using a pairing code.
// Usage: PAIRING_CODE=123456 node scripts/register-pc.js
// Reads PC_SECRET + CLOUD_SERVER_URL from .env, appends PC_ID to .env on success.
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const pairingCode = process.env.PAIRING_CODE || process.argv[2];
if (!pairingCode) {
  console.error('Usage: PAIRING_CODE=123456 node scripts/register-pc.js');
  console.error('   or: node scripts/register-pc.js 123456');
  process.exit(1);
}

const cloudUrl = process.env.CLOUD_SERVER_URL;
const pcSecret = process.env.PC_SECRET;
const pcName = process.env.PC_NAME || os.hostname();

if (!cloudUrl) { console.error('CLOUD_SERVER_URL not set in .env'); process.exit(1); }
if (!pcSecret) { console.error('PC_SECRET not set in .env'); process.exit(1); }

console.log(`Registering PC '${pcName}' with ${cloudUrl}...`);
console.log(`  pairingCode: ${pairingCode}`);

const body = {
  pairingCode,
  pcSecret,
  hostname: os.hostname(),
  platform: process.platform,
  mac: null,
  pcName,
};

const res = await fetch(`${cloudUrl}/api/pcs/register`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});
const data = await res.json().catch(() => ({}));

if (!res.ok) {
  console.error(`Register failed: ${res.status}`, data);
  process.exit(1);
}

console.log(`✔ Register success. pcId = ${data.pcId}`);

// Append PC_ID to .env (or replace if exists)
const envPath = path.resolve(process.cwd(), '.env');
let envContent = fs.readFileSync(envPath, 'utf8');
if (envContent.match(/^PC_ID=/m)) {
  envContent = envContent.replace(/^PC_ID=.*$/m, `PC_ID=${data.pcId}`);
} else {
  envContent += `\nPC_ID=${data.pcId}\n`;
}
fs.writeFileSync(envPath, envContent, 'utf8');
console.log(`✔ PC_ID written to ${envPath}`);
console.log('');
console.log('Next: restart the dev server (Ctrl+C then re-run) to pick up the new PC_ID.');
