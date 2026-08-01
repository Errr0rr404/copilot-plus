'use strict';

const fs   = require('fs');
const os   = require('os');
const path = require('path');
const { eq, ok } = require('./_assert');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'copilot-plus-test-bm-'));
fs.mkdirSync(path.join(TMP, '.copilot'), { recursive: true });
process.env.HOME = TMP;
process.env.USERPROFILE = TMP;

delete require.cache[require.resolve('../src/bookmarks')];
const bm = require('../src/bookmarks');

it('add returns an id and stores the entry', () => {
  const id = bm.add({ body: '# Cool result\nfoo bar', tags: ['notes'] });
  ok(id, 'id should be truthy');
  const fetched = bm.get(id);
  eq(fetched.title, 'Cool result');
  eq(fetched.tags[0], 'notes');
});

it('list filters by query', () => {
  bm.add({ body: 'docker compose tips' });
  bm.add({ body: 'rust traits explained' });
  const docker = bm.list({ query: 'docker' });
  ok(docker.length >= 1);
  ok(docker.every(b => /docker/i.test(b.body + b.title)));
});

it('list filters by tag', () => {
  bm.add({ body: 'tagged item', tags: ['x'] });
  const onlyX = bm.list({ tag: 'x' });
  ok(onlyX.every(b => b.tags.includes('x')));
});

it('remove deletes a bookmark', () => {
  const id = bm.add({ body: 'temporary' });
  eq(bm.remove(id), true);
  eq(bm.get(id), null);
});

it('add with empty body returns null', () => {
  eq(bm.add({ body: '' }), null);
});

it('tagCounts aggregates', () => {
  bm.add({ body: 'a', tags: ['t1'] });
  bm.add({ body: 'b', tags: ['t1', 't2'] });
  const counts = bm.tagCounts();
  ok(counts.t1 >= 2);
  ok(counts.t2 >= 1);
});

process.on('exit', () => {
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch {}
});
