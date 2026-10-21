/** @jest-environment node */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { findOutsideReads, summarizeStream, toolInputs, unwrapCommand } from './stream.mjs';

describe('Codex stream adapter', () => {
  it('unwraps a Bash script and reports file changes as tool paths', () => {
    expect(unwrapCommand("/bin/bash -lc 'echo '\\''hello'\\'''")).toBe("echo 'hello'");
    const events = [
      {
        type: 'item.completed',
        item: { type: 'command_execution', command: "/bin/bash -lc 'git status'" },
      },
      {
        type: 'item.completed',
        item: { type: 'file_change', changes: [{ path: '/outside/a', kind: 'update' }] },
      },
    ];
    expect(toolInputs(events)).toEqual([{ command: 'git status' }, { file_path: '/outside/a' }]);
    expect(
      findOutsideReads(events, { clone: '/clone', allowedRoots: ['/clone'], deniedRoots: [] }),
    ).toEqual(['/outside/a']);
  });
  it('reads the model and effort only from its own transcript, with pinned fallback', () => {
    const home = mkdtempSync(join(tmpdir(), 'codex-stream-'));
    const dir = join(home, 'sessions/2026/10/20');
    mkdirSync(dir, { recursive: true });
    const events = [
      { type: 'thread.started', thread_id: 'thread-one' },
      {
        type: 'turn.completed',
        usage: { input_tokens: 5, cached_input_tokens: 2, output_tokens: 3 },
      },
    ];
    try {
      expect(summarizeStream(events, 'codex', { codexHome: home })).toMatchObject({
        resolvedModel: 'gpt-6.1-sol',
        modelSource: 'pinned',
        sessionId: 'thread-one',
        turns: 1,
        costUsd: null,
      });
      writeFileSync(
        join(dir, 'rollout-thread-other.jsonl'),
        JSON.stringify({ type: 'turn_context', payload: { model: 'wrong' } }),
      );
      writeFileSync(
        join(dir, 'rollout-thread-one.jsonl'),
        JSON.stringify({
          type: 'turn_context',
          payload: { model: 'gpt-6.1-sol', effort: 'medium' },
        }),
      );
      expect(summarizeStream(events, 'codex', { codexHome: home })).toMatchObject({
        modelSource: 'transcript',
        reasoningEffort: 'medium',
        tokenUsage: { input_tokens: 5, cached_input_tokens: 2, output_tokens: 3 },
      });
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });
});
