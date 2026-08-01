'use strict';

const { eq, ok } = require('./_assert');
const { PromptQueue } = require('../src/prompt-queue');

it('enqueue + dequeue FIFO', () => {
  const q = new PromptQueue({ maxSize: 5 });
  ok(q.enqueue('a').ok);
  ok(q.enqueue('b').ok);
  eq(q.dequeue().text, 'a');
  eq(q.dequeue().text, 'b');
  eq(q.dequeue(), null);
});

it('rejects empty and full', () => {
  const q = new PromptQueue({ maxSize: 1 });
  eq(q.enqueue('').ok, false);
  ok(q.enqueue('one').ok);
  eq(q.enqueue('two').ok, false);
  eq(q.enqueue('two').reason, 'full');
});

it('reorder and remove', () => {
  const q = new PromptQueue();
  q.enqueue('a');
  q.enqueue('b');
  q.enqueue('c');
  ok(q.reorder(2, 0));
  eq(q.list()[0].text, 'c');
  ok(q.remove(1));
  eq(q.length, 2);
});
