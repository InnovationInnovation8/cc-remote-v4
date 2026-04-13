// CC-Remote v4 — PC list local storage manager
// Schema: localStorage['cc_remote_pcs'] = [{ id, label, url, addedAt }]
//
// id     : crypto.randomUUID() (client-generated)
// label  : user-set display name
// url    : cloudflared tunnel URL (https://xxx.trycloudflare.com)
// addedAt: ISO 8601 timestamp
//
// Migration: ccr-remote-base (v3 single-PC URL) → first entry in cc_remote_pcs

const KEY = 'cc_remote_pcs';
const LEGACY_KEY = 'ccr-remote-base';

export function listPcs() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) {
      // One-time migration from v3 single-PC URL
      const legacy = localStorage.getItem(LEGACY_KEY);
      if (legacy) {
        const migrated = [{
          id: crypto.randomUUID(),
          label: 'My PC',
          url: legacy,
          addedAt: new Date().toISOString(),
        }];
        savePcs(migrated);
        return migrated;
      }
      return [];
    }
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export function savePcs(list) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list || []));
  } catch {}
}

export function addPc({ label, url }) {
  if (!url) throw new Error('url required');
  const cleanUrl = url.replace(/\/+$/, '');
  const list = listPcs();
  // Avoid duplicates by URL
  if (list.some(p => p.url === cleanUrl)) {
    throw new Error('このPCはすでに登録されています');
  }
  const pc = {
    id: crypto.randomUUID(),
    label: (label || '').trim() || cleanUrl,
    url: cleanUrl,
    addedAt: new Date().toISOString(),
  };
  list.push(pc);
  savePcs(list);
  return pc;
}

export function removePc(id) {
  const list = listPcs().filter(p => p.id !== id);
  savePcs(list);
}

export function renamePc(id, newLabel) {
  const list = listPcs().map(p => p.id === id ? { ...p, label: newLabel } : p);
  savePcs(list);
}

export function findPc(id) {
  return listPcs().find(p => p.id === id) || null;
}

// Health check: ping the tunnel URL's /api/ping (auth-free in v4)
export async function pingPc(url, timeoutMs = 3000) {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch(`${url}/api/ping`, { method: 'HEAD', signal: ctrl.signal });
    clearTimeout(timer);
    return res.ok;
  } catch {
    return false;
  }
}
