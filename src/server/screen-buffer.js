// Screen Buffer - Virtual terminal emulator (ported from v2.0)

function charWidth(ch) {
  const code = ch.codePointAt(0);
  if (code <= 0x7e) return 1;
  if ((code >= 0x1100 && code <= 0x115f) ||
      (code >= 0x2e80 && code <= 0x303e) ||
      (code >= 0x3040 && code <= 0x33bf) ||
      (code >= 0x3400 && code <= 0x4dbf) ||
      (code >= 0x4e00 && code <= 0xa4cf) ||
      (code >= 0xac00 && code <= 0xd7a3) ||
      (code >= 0xf900 && code <= 0xfaff) ||
      (code >= 0xfe30 && code <= 0xfe6f) ||
      (code >= 0xff01 && code <= 0xff60) ||
      (code >= 0xffe0 && code <= 0xffe6) ||
      (code >= 0x20000 && code <= 0x2fffd) ||
      (code >= 0x30000 && code <= 0x3fffd) ||
      (code >= 0x1f000 && code <= 0x1fbff))
  { return 2; }
  return 1;
}

class ScreenBuffer {
  constructor(cols = 120, rows = 40) {
    this.cols = cols;
    this.rows = rows;
    this.scrollback = [];
    this.screen = [];
    this.cursorRow = 0;
    this.cursorCol = 0;
    this.savedCursor = { row: 0, col: 0 };
    this.scrollTop = 0;
    this.scrollBottom = rows - 1;
    this._inDCS = false;
    this._dirty = false;
    this._initScreen();
  }
  get dirty() { return this._dirty; }
  _initScreen() {
    this.screen = [];
    for (let i = 0; i < this.rows; i++) {
      this.screen.push(new Array(this.cols).fill(' '));
    }
  }
  write(data) {
    this._dirty = true;
    const chars = Array.from(data);
    let i = 0;
    while (i < chars.length) {
      if (this._inDCS) {
        while (i < chars.length) {
          if (chars[i] === '\x1b' && i + 1 < chars.length && chars[i + 1] === '\\') { i += 2; this._inDCS = false; break; }
          i++;
        }
        continue;
      }
      const ch = chars[i];
      if (ch === '\x1b') {
        i++;
        if (i >= chars.length) break;
        if (chars[i] === '[') {
          i++;
          let params = '';
          while (i < chars.length && ((chars[i] >= '0' && chars[i] <= '9') || chars[i] === ';' || chars[i] === '?' || chars[i] === '>' || chars[i] === '<' || chars[i] === '!')) { params += chars[i]; i++; }
          if (i < chars.length) { this._handleCSI(params, chars[i]); i++; }
        } else if (chars[i] === ']') {
          i++;
          while (i < chars.length) {
            if (chars[i] === '\x07') { i++; break; }
            if (chars[i] === '\x1b' && i + 1 < chars.length && chars[i + 1] === '\\') { i += 2; break; }
            i++;
          }
        } else if (chars[i] === 'P') {
          i++; this._inDCS = true;
          while (i < chars.length) {
            if (chars[i] === '\x1b' && i + 1 < chars.length && chars[i + 1] === '\\') { i += 2; this._inDCS = false; break; }
            i++;
          }
        } else if (chars[i] === '(' || chars[i] === ')') { i += 2; }
        else if (chars[i] === '7') { this.savedCursor = { row: this.cursorRow, col: this.cursorCol }; i++; }
        else if (chars[i] === '8') { this.cursorRow = this.savedCursor.row; this.cursorCol = this.savedCursor.col; i++; }
        else if (chars[i] === 'M') { if (this.cursorRow === this.scrollTop) { this._scrollDown(); } else if (this.cursorRow > 0) { this.cursorRow--; } i++; }
        else if (chars[i] === 'D') { if (this.cursorRow === this.scrollBottom) { this._scrollUp(); } else if (this.cursorRow < this.rows - 1) { this.cursorRow++; } i++; }
        else { i++; }
        continue;
      }
      if (ch === '\r') { this.cursorCol = 0; i++; continue; }
      if (ch === '\n') { if (this.cursorRow === this.scrollBottom) { this._scrollUp(); } else if (this.cursorRow < this.rows - 1) { this.cursorRow++; } i++; continue; }
      if (ch === '\t') { this.cursorCol = Math.min(this.cols - 1, (Math.floor(this.cursorCol / 8) + 1) * 8); i++; continue; }
      if (ch === '\b' || ch === '\x7f') { if (this.cursorCol > 0) this.cursorCol--; i++; continue; }
      if (ch === '\x07') { i++; continue; }
      if (ch.codePointAt(0) < 32) { i++; continue; }
      const w = charWidth(ch);
      if (this.cursorRow >= 0 && this.cursorRow < this.rows && this.cursorCol >= 0 && this.cursorCol < this.cols) {
        this.screen[this.cursorRow][this.cursorCol] = ch;
        if (w === 2 && this.cursorCol + 1 < this.cols) { this.screen[this.cursorRow][this.cursorCol + 1] = ''; }
        this.cursorCol += w;
        if (this.cursorCol >= this.cols) { this.cursorCol = 0; if (this.cursorRow === this.scrollBottom) { this._scrollUp(); } else if (this.cursorRow < this.rows - 1) { this.cursorRow++; } }
      }
      i++;
    }
  }
  _handleCSI(params, cmd) {
    const args = params.replace(/[?><! ]/g, '').split(';').map(n => parseInt(n) || 0);
    const n = args[0] || 1;
    const isPrivate = params.startsWith('?');
    switch (cmd) {
      case 'A': this.cursorRow = Math.max(0, this.cursorRow - n); break;
      case 'B': this.cursorRow = Math.min(this.rows - 1, this.cursorRow + n); break;
      case 'C': this.cursorCol = Math.min(this.cols - 1, this.cursorCol + n); break;
      case 'D': this.cursorCol = Math.max(0, this.cursorCol - n); break;
      case 'E': this.cursorRow = Math.min(this.rows - 1, this.cursorRow + n); this.cursorCol = 0; break;
      case 'F': this.cursorRow = Math.max(0, this.cursorRow - n); this.cursorCol = 0; break;
      case 'G': this.cursorCol = Math.min(this.cols - 1, Math.max(0, n - 1)); break;
      case 'H': case 'f': this.cursorRow = Math.min(this.rows - 1, Math.max(0, (args[0] || 1) - 1)); this.cursorCol = Math.min(this.cols - 1, Math.max(0, (args[1] || 1) - 1)); break;
      case 'J': this._eraseDisplay(args[0] || 0); break;
      case 'K': this._eraseLine(args[0] || 0); break;
      case 'L': for (let j = 0; j < n; j++) { this.screen.splice(this.cursorRow, 0, new Array(this.cols).fill(' ')); this.screen.splice(this.scrollBottom + 1, 1); } break;
      case 'M': for (let j = 0; j < n; j++) { this.screen.splice(this.cursorRow, 1); this.screen.splice(this.scrollBottom, 0, new Array(this.cols).fill(' ')); } break;
      case 'S': for (let j = 0; j < n; j++) this._scrollUp(); break;
      case 'T': for (let j = 0; j < n; j++) this._scrollDown(); break;
      case 'd': this.cursorRow = Math.min(this.rows - 1, Math.max(0, n - 1)); break;
      case 'r': this.scrollTop = (args[0] || 1) - 1; this.scrollBottom = (args[1] || this.rows) - 1; this.cursorRow = 0; this.cursorCol = 0; break;
      case 's': if (!isPrivate) { this.savedCursor = { row: this.cursorRow, col: this.cursorCol }; } break;
      case 'u': if (!isPrivate) { this.cursorRow = this.savedCursor.row; this.cursorCol = this.savedCursor.col; } break;
      case 'P': for (let j = 0; j < n && this.cursorCol + j < this.cols; j++) { this.screen[this.cursorRow].splice(this.cursorCol, 1); this.screen[this.cursorRow].push(' '); } break;
      case '@': for (let j = 0; j < n; j++) { this.screen[this.cursorRow].splice(this.cursorCol, 0, ' '); this.screen[this.cursorRow].pop(); } break;
      case 'X': for (let j = 0; j < n && this.cursorCol + j < this.cols; j++) { this.screen[this.cursorRow][this.cursorCol + j] = ' '; } break;
    }
  }
  _eraseDisplay(mode) {
    if (mode === 0) { for (let c = this.cursorCol; c < this.cols; c++) this.screen[this.cursorRow][c] = ' '; for (let r = this.cursorRow + 1; r < this.rows; r++) this.screen[r].fill(' '); }
    else if (mode === 1) { for (let r = 0; r < this.cursorRow; r++) this.screen[r].fill(' '); for (let c = 0; c <= this.cursorCol; c++) this.screen[this.cursorRow][c] = ' '; }
    else if (mode === 2 || mode === 3) { for (let r = 0; r < this.rows; r++) this.screen[r].fill(' '); }
  }
  _eraseLine(mode) {
    if (mode === 0) { for (let c = this.cursorCol; c < this.cols; c++) this.screen[this.cursorRow][c] = ' '; }
    else if (mode === 1) { for (let c = 0; c <= this.cursorCol; c++) this.screen[this.cursorRow][c] = ' '; }
    else if (mode === 2) { this.screen[this.cursorRow].fill(' '); }
  }
  _scrollUp() {
    const removed = this.screen.splice(this.scrollTop, 1)[0];
    this.scrollback.push(removed.join('').trimEnd());
    if (this.scrollback.length > 1000) { this.scrollback.splice(0, this.scrollback.length - 1000); }
    this.screen.splice(this.scrollBottom, 0, new Array(this.cols).fill(' '));
  }
  _scrollDown() {
    this.screen.splice(this.scrollBottom, 1);
    this.screen.splice(this.scrollTop, 0, new Array(this.cols).fill(' '));
  }
  capture() {
    this._dirty = false;
    const lines = [];
    for (let r = 0; r < this.rows; r++) { lines.push(this.screen[r].join('').trimEnd()); }
    while (lines.length > 0 && lines[lines.length - 1] === '') { lines.pop(); }
    return lines.join('\n');
  }
  captureAll() {
    const screenLines = [];
    for (let r = 0; r < this.rows; r++) { screenLines.push(this.screen[r].join('').trimEnd()); }
    while (screenLines.length > 0 && screenLines[screenLines.length - 1] === '') { screenLines.pop(); }
    return [...this.scrollback, ...screenLines].join('\n');
  }
  getNewScrollback(since) {
    if (since >= this.scrollback.length) return [];
    return this.scrollback.slice(since);
  }
  reset() {
    this.scrollback = [];
    this.cursorRow = 0;
    this.cursorCol = 0;
    this.scrollTop = 0;
    this.scrollBottom = this.rows - 1;
    this._inDCS = false;
    this._initScreen();
  }
}

export { charWidth };
export default ScreenBuffer;
