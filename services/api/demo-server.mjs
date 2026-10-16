// Explicit development demo: synthetic model responses, real 25-minute task clock and SQLite state.
// Never load this adapter from the live service or count its output as a GeniOS result.
import { resolve } from 'node:path';
import { TaskStore } from './task-store.mjs';
import { createApiServer } from './api-server.mjs';

const syntheticAgent = async context => {
  const base = { reply: '这是本地合成联调。可发送“合成联调：专注”测试接受任务；真实GeniOS尚未连接。',
    pet_action: 'idle', strategy: 'listen', suggested_task: null, sources: [] };
  if (context.completion_verified) return { ...base, reply: '合成反馈：服务端已确认任务完成，积分为0。', pet_action: 'happy', strategy: 'feedback' };
  if (context.suggestion_policy.allow_suggestion && context.event.user_message === '合成联调：专注')
    return { ...base, reply: '合成建议：要开始25分钟专注吗？接受后才开始实际计时。', strategy: 'focus', suggested_task: 'focus_25' };
  return base;
};
const store = new TaskStore({ filename: resolve('data/private/demo-tasks.sqlite') });
const server = createApiServer({ store, agent: syntheticAgent, mode: 'mock' });
server.listen(8788, '127.0.0.1', () => console.log('Synthetic demo only: http://127.0.0.1:8788 — real timer/storage, no GeniOS or points.'));
const stop = () => server.close(() => store.close());
process.once('SIGINT', stop);
process.once('SIGTERM', stop);
