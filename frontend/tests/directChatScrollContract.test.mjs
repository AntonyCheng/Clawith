import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const agentDetail = readFileSync(
  new URL('../src/pages/agent-detail/AgentDetailPage.tsx', import.meta.url),
  'utf8',
);
const styles = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');

test('direct chat keeps document scrolling separate from history pagination', () => {
  assert.doesNotMatch(agentDetail, /height:\s*'calc\(100vh - 100px\)'/);
  assert.equal(
    agentDetail.match(/className="agent-chat-message-scroll"/g)?.length,
    2,
    'read-only and writable histories must share the bounded scroll container',
  );
  assert.match(
    styles,
    /\.agent-chat-message-scroll\s*\{[^}]*min-height:\s*0;[^}]*overflow-y:\s*auto;[^}]*overscroll-behavior-y:\s*contain;/s,
  );
  assert.equal(
    agentDetail.match(/className="agent-chat-history-sentinel"/g)?.length,
    2,
    'both history views must load from a top sentinel when scrollTop cannot change',
  );
  assert.match(agentDetail, /new IntersectionObserver\(/);
  assert.match(agentDetail, /root:\s*container/);
});
