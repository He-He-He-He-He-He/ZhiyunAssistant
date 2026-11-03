import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AppActions } from '../src/shared/model/AppActions';
import { AiStream } from '../src/shared/model/AiStream';
import { AiClient } from '../src/shared/services/AiClient';
import { AppAssistantRunner, AssistantMessage } from '../src/shared/model/AppAssistant';

test('assistant executes only registered, validated actions and reports their results to the model', async () => {
  const actions = new AppActions(); let count = 0, messages: AssistantMessage[] = [];
  actions.register({ name: 'open', description: '打开', parameters: { type: 'object', properties: { page: { type: 'string', enum: ['home'] } }, required: ['page'] }, run: () => { count++; return { opened: true }; } });
  const runner = new AppAssistantRunner(actions, { turn: async input => { messages = [...input]; return count ? { answer: '已打开', calls: [] } : { answer: '', calls: [{ id: '1', function: { name: 'app_do', arguments: '{"action":"open","args":{"page":"home"}}' } }] }; } }, () => 'user');
  assert.equal(await runner.run('打开首页'), '已打开'); assert.equal(count, 1); assert.match(messages.find(item => item.role === 'tool')?.content || '', /opened/);
});
test('account changes cancel a pending model response before actions execute', async () => {
  const actions = new AppActions(); let owner = 'a', count = 0;
  actions.register({ name: 'open', description: '', parameters: { type: 'object' }, run: () => { count++; } });
  const runner = new AppAssistantRunner(actions, { turn: async () => { owner = 'b'; return { answer: '', calls: [{ id: '1', function: { name: 'app_do', arguments: '{"action":"open","args":{}}' } }] }; } }, () => owner);
  await assert.rejects(runner.run('打开'), /账号已切换/); assert.equal(count, 0);
});

test('stream preserves a truncated finish reason so partial tool calls are never run', async () => {
  const stream = new AiStream(); stream.push('data: {"choices":[{"finish_reason":"length","delta":{}}]}\n\ndata: [DONE]\n', () => {});
  assert.equal(stream.finishReason, 'length'); let called = 0; const actions = new AppActions();
  actions.register({ name: 'open', description: '', parameters: { type: 'object' }, run: () => { called++; } });
  const runner = new AppAssistantRunner(actions, { turn: async () => ({ answer: '', calls: [{ id: '1', function: { name: 'app_do', arguments: '{"action":"open","args":{}}' } }], truncated: stream.finishReason === 'length' }) }, () => 'a');
  await assert.rejects(runner.run('打开'), /未完整/); assert.equal(called, 0);
});

test('model transport uses the selected official model and rejects truncated actions', async () => {
  const saved = AiClient.savedKey; AiClient.savedKey = async () => 'synthetic-only';
  try {
    const client: any = new AiClient(); let sent: any;
    client.stream = async (_key: string, request: any) => { sent = request; return { answer: '', calls: [], finishReason: 'length' }; };
    const result = await client.assistantTurn({} as any, 'deepseek-flash', [{ role: 'user', content: '测试' }], [], () => {});
    assert.equal(sent.model, 'deepseek-flash'); assert.equal(sent.thinking.type, 'enabled'); assert.equal(result.truncated, true);
  } finally { AiClient.savedKey = saved; }
});

test('thinking-mode reasoning is carried forward during tool calls', async () => {
  const stream = new AiStream(); stream.push('data: {"choices":[{"delta":{"reasoning_content":"step"}}]}\n', () => {});
  const actions = new AppActions(); let round = 0; actions.register({ name: 'open', description: '', parameters: { type: 'object' }, run: () => ({ ok: true }) });
  const runner = new AppAssistantRunner(actions, { turn: async messages => { if (round++ === 0) return { answer: '', reasoning_content: stream.reasoning, calls: [{ id: '1', function: { name: 'app_do', arguments: '{"action":"open","args":{}}' } }] }; assert.equal(messages.find(item => item.tool_calls)?.reasoning_content, 'step'); return { answer: '完成', calls: [] }; } }, () => 'a');
  assert.equal(await runner.run('打开'), '完成');
});
