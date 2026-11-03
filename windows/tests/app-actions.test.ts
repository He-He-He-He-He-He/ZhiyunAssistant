import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AppActions } from '../src/shared/model/AppActions';

test('registered in-app actions validate their arguments before execution', async () => {
  const actions = new AppActions(); let count = 0;
  actions.register({ name: 'seek', description: '跳转', parameters: { type: 'object', properties: { seconds: { type: 'number', minimum: 0, maximum: 3600 } }, required: ['seconds'] }, run: args => { count++; return args.seconds; } });
  assert.equal(await actions.execute('seek', { seconds: 10 }), 10);
  for (const args of [{}, { seconds: -1 }, { seconds: NaN }, { seconds: 1, extra: true }]) await assert.rejects(actions.execute('seek', args));
  await assert.rejects(actions.execute('unknown', {})); assert.equal(count, 1);
  assert.equal('run' in actions.catalogue()[0], false);
});
test('action guard rejects switched accounts both before and after a task', async () => {
  const actions = new AppActions(); let calls = 0;
  actions.register({ name: 'read', description: '读取', parameters: { type: 'object' }, run: async () => 'done' });
  await assert.rejects(actions.execute('read', {}, () => { if (++calls === 2) throw new Error('账号已切换'); }), /账号已切换/);
});
