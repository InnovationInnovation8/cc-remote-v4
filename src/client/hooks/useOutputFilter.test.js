import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filterOutput } from './useOutputFilter.js';

test('stageMode=normal passes all lines through unchanged', () => {
  const input = ['<bash>', 'hello', '```js', 'x=1', '```', '<thinking>', 'secret', '</thinking>'];
  const out = filterOutput(input, 'normal');
  assert.equal(out.length, input.length);
  out.forEach((line, i) => {
    assert.equal(line.text, input[i]);
    assert.equal(line._filtered, false);
    assert.equal(line._collapsed, false);
  });
});

test('stageMode=full passes all lines through unchanged', () => {
  const input = ['<bash>', 'hello'];
  const out = filterOutput(input, 'full');
  assert.equal(out.length, 2);
  assert.equal(out[0].text, '<bash>');
  assert.equal(out[0]._filtered, false);
});

test('reduce: tool-call tag becomes 🔧 icon', () => {
  const out = filterOutput(['<bash>', '<read_file>', 'normal line'], 'reduce');
  assert.equal(out.length, 3);
  assert.equal(out[0].text, '🔧 bash');
  assert.equal(out[0]._filtered, true);
  assert.equal(out[1].text, '🔧 read_file');
  assert.equal(out[2].text, 'normal line');
  assert.equal(out[2]._filtered, false);
});

test('reduce: thinking block (multi-line span) is removed', () => {
  const input = ['before', '<thinking>', 'hidden1', 'hidden2', '</thinking>', 'after'];
  const out = filterOutput(input, 'reduce');
  assert.equal(out.length, 2);
  assert.equal(out[0].text, 'before');
  assert.equal(out[1].text, 'after');
});

test('reduce: multiple thinking blocks in same output', () => {
  const input = ['a', '<thinking>', 'x', '</thinking>', 'b', '<thinking>', 'y', '</thinking>', 'c'];
  const out = filterOutput(input, 'reduce');
  assert.deepEqual(out.map((l) => l.text), ['a', 'b', 'c']);
});

test('reduce: empty thinking block <thinking></thinking> single line', () => {
  const input = ['a', '<thinking></thinking>', 'b'];
  const out = filterOutput(input, 'reduce');
  assert.deepEqual(out.map((l) => l.text), ['a', 'b']);
});

test('reduce: code block collapses into 🔽 プレビュー line', () => {
  const input = ['intro', '```js', 'const x = 1;', 'const y = 2;', '```', 'outro'];
  const out = filterOutput(input, 'reduce');
  assert.equal(out.length, 3);
  assert.equal(out[0].text, 'intro');
  assert.equal(out[1].text, '🔽 コード 4行');
  assert.equal(out[1]._collapsed, true);
  assert.equal(out[1]._filtered, true);
  assert.deepEqual(out[1]._lines, ['```js', 'const x = 1;', 'const y = 2;', '```']);
  assert.equal(out[2].text, 'outro');
});

test('reduce: unclosed code block collapses remainder with 未閉じ marker', () => {
  const input = ['intro', '```', 'line a', 'line b'];
  const out = filterOutput(input, 'reduce');
  assert.equal(out.length, 2);
  assert.equal(out[0].text, 'intro');
  assert.ok(out[1].text.includes('🔽 コード'));
  assert.ok(out[1].text.includes('未閉じ'));
  assert.equal(out[1]._collapsed, true);
  assert.equal(out[1]._lines.length, 3);
});

test('reduce: consecutive code blocks (odd/even stack) handled correctly', () => {
  const input = ['a', '```outer', 'content-1', '```', 'between', '```', 'content-2', '```', 'z'];
  const out = filterOutput(input, 'reduce');
  const texts = out.map((l) => l.text);
  assert.equal(texts[0], 'a');
  assert.ok(texts[1].startsWith('🔽 コード'));
  assert.equal(texts[2], 'between');
  assert.ok(texts[3].startsWith('🔽 コード'));
  assert.equal(texts[4], 'z');
});

test('reduce: empty input returns empty array', () => {
  assert.deepEqual(filterOutput([], 'reduce'), []);
  assert.deepEqual(filterOutput(null, 'reduce'), []);
  assert.deepEqual(filterOutput(undefined, 'reduce'), []);
});
