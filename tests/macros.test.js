'use strict';

const MacroManager = require('../src/macros');
const { eq, deepEq } = require('./_assert');

it('parses kitty/WezTerm Ctrl+1 (CSI u)', () => {
  const m = new MacroManager({ macros: {} });
  eq(m.parseSlot('\x1b[49;5u'), 1);
  eq(m.parseSlot('\x1b[57;5u'), 9);
});

it('parses macOS Terminal Option+1 (meta+digit)', () => {
  const m = new MacroManager({ macros: {} });
  eq(m.parseSlot('\x1b1'), 1);
  eq(m.parseSlot('\x1b9'), 9);
});

it('returns null on non-macro input', () => {
  const m = new MacroManager({ macros: {} });
  eq(m.parseSlot('a'), null);
  eq(m.parseSlot('\x1b[A'), null);
});

it('get/set/list round-trips', () => {
  const m = new MacroManager({ macros: { 1: 'hello', 3: 'world' } });
  eq(m.get(1), 'hello');
  eq(m.get(2), '');
  m.set(2, 'middle');
  deepEq(m.list(), [
    { slot: 1, prompt: 'hello' },
    { slot: 2, prompt: 'middle' },
    { slot: 3, prompt: 'world' },
  ]);
});
