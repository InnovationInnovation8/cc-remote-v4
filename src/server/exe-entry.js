/**
 * exe-entry.js — Minimal entry point for the CC Remote PC Agent exe (pkg bundle)
 *
 * This file is intentionally minimal: it does a side-effect import of index.js,
 * which triggers index.js's own _main() logic (first-run check + start()).
 *
 * Why no dynamic import: pkg does not support `await import('./index.js')` at
 * module entry (ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING). See Rev 4 BLOCKER-1.
 * Why not destructure `{ start }`: pkg has trouble resolving named exports from
 * index.js across its snapshot filesystem. Side-effect import is the safest form.
 */

import './index.js';
