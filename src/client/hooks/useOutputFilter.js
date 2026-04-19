import { useMemo } from 'react';

const TOOL_TAG = /^\s*<([a-z_]+)>\s*$/;
const THINKING_OPEN = /<thinking>/;
const THINKING_CLOSE = /<\/thinking>/;
const CODE_FENCE = /^```/;

export function filterOutput(lines, stageMode) {
  if (!Array.isArray(lines) || lines.length === 0) return [];

  if (stageMode !== 'reduce') {
    return lines.map((text) => ({ text: text ?? '', _filtered: false, _collapsed: false, _lines: [] }));
  }

  const result = [];
  let inThinking = false;
  let codeBlockDepth = 0;
  let codeStart = -1;
  let codeBuffer = [];

  for (let i = 0; i < lines.length; i += 1) {
    const raw = lines[i] ?? '';

    if (THINKING_OPEN.test(raw)) {
      inThinking = true;
      if (THINKING_CLOSE.test(raw)) {
        inThinking = false;
      }
      continue;
    }
    if (inThinking) {
      if (THINKING_CLOSE.test(raw)) inThinking = false;
      continue;
    }

    if (CODE_FENCE.test(raw.trim())) {
      codeBlockDepth += 1;
      if (codeBlockDepth % 2 === 1) {
        codeStart = i;
        codeBuffer = [raw];
      } else {
        codeBuffer.push(raw);
        const count = codeBuffer.length;
        result.push({
          text: `🔽 コード ${count}行`,
          _filtered: true,
          _collapsed: true,
          _lines: codeBuffer.slice(),
        });
        codeStart = -1;
        codeBuffer = [];
      }
      continue;
    }

    if (codeBlockDepth % 2 === 1) {
      codeBuffer.push(raw);
      continue;
    }

    const toolMatch = raw.match(TOOL_TAG);
    if (toolMatch) {
      result.push({
        text: `🔧 ${toolMatch[1]}`,
        _filtered: true,
        _collapsed: false,
        _lines: [],
      });
      continue;
    }

    result.push({ text: raw, _filtered: false, _collapsed: false, _lines: [] });
  }

  if (codeBlockDepth % 2 === 1 && codeBuffer.length > 0) {
    result.push({
      text: `🔽 コード ${codeBuffer.length}行（未閉じ）`,
      _filtered: true,
      _collapsed: true,
      _lines: codeBuffer.slice(),
    });
  }

  return result;
}

export function useOutputFilter(lines, stageMode) {
  return useMemo(() => filterOutput(lines, stageMode), [lines, stageMode]);
}
