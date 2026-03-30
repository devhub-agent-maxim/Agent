/**
 * Tests for claude-runner.js
 *
 * Coverage:
 * - extractStructured() - JSON extraction from various formats
 * - runClaude() - CLI execution with prompts
 * - Timeout handling
 * - Error scenarios
 * - Stream output collection
 * - Model selection
 */

'use strict';

const { EventEmitter } = require('events');

// Mock dependencies before requiring the module
jest.mock('child_process');

// Mock config with proper structure
jest.mock('./config', () => ({
  config: {
    claude: {
      cmd: 'claude',
    },
  },
}));

const childProcess = require('child_process');

// Helper to create mock child process
function createMockChildProcess() {
  const mockChild = new EventEmitter();
  mockChild.stdin = new EventEmitter();
  mockChild.stdin.write = jest.fn();
  mockChild.stdin.end = jest.fn();
  mockChild.stdout = new EventEmitter();
  mockChild.stderr = new EventEmitter();
  mockChild.kill = jest.fn();
  return mockChild;
}

// Setup default mock implementation
let mockChild = createMockChildProcess();
childProcess.spawn = jest.fn(() => mockChild);

// Load the claude-runner module (after mocks are set up)
const claudeRunner = require('./claude-runner');

describe('runClaude - basic execution', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockChild = createMockChildProcess();
    childProcess.spawn.mockReturnValue(mockChild);
  });

  test('successfully executes prompt and returns output', async () => {
    const prompt = 'Test prompt';
    const expectedOutput = 'Claude response text';

    const resultPromise = claudeRunner.runClaude(prompt);

    // Simulate stdout data
    mockChild.stdout.emit('data', Buffer.from(expectedOutput));

    // Simulate process close with success
    setTimeout(() => mockChild.emit('close', 0), 10);

    const result = await resultPromise;

    expect(result.success).toBe(true);
    expect(result.output).toBe(expectedOutput);
    expect(mockChild.stdin.write).toHaveBeenCalledWith(prompt);
    expect(mockChild.stdin.end).toHaveBeenCalled();
  });

  test('passes correct CLI arguments to spawn', async () => {
    const prompt = 'Test prompt';

    const resultPromise = claudeRunner.runClaude(prompt);

    setTimeout(() => {
      mockChild.stdout.emit('data', Buffer.from('output'));
      mockChild.emit('close', 0);
    }, 10);

    await resultPromise;

    expect(childProcess.spawn).toHaveBeenCalledWith(
      'claude',
      ['--print', '--dangerously-skip-permissions', '--no-session-persistence', '--model', 'claude-sonnet-4-5'],
      expect.objectContaining({
        cwd: expect.any(String),
        env: expect.any(Object),
        windowsHide: true,
        shell: true,
        stdio: ['pipe', 'pipe', 'pipe'],
      })
    );
  });

  test('collects multiple stdout chunks', async () => {
    const prompt = 'Test prompt';

    const resultPromise = claudeRunner.runClaude(prompt);

    // Simulate multiple stdout chunks
    mockChild.stdout.emit('data', Buffer.from('First chunk '));
    mockChild.stdout.emit('data', Buffer.from('Second chunk '));
    mockChild.stdout.emit('data', Buffer.from('Third chunk'));

    setTimeout(() => mockChild.emit('close', 0), 10);

    const result = await resultPromise;

    expect(result.output).toBe('First chunk Second chunk Third chunk');
  });

  test('collects stderr when stdout is empty', async () => {
    const prompt = 'Test prompt';
    const stderrOutput = 'Error message from stderr';

    const resultPromise = claudeRunner.runClaude(prompt);

    mockChild.stderr.emit('data', Buffer.from(stderrOutput));
    setTimeout(() => mockChild.emit('close', 1), 10);

    const result = await resultPromise;

    expect(result.output).toBe(stderrOutput);
  });

  test('handles non-zero exit code but with stdout output as success', async () => {
    const prompt = 'Test prompt';
    const output = 'Some output despite error';

    const resultPromise = claudeRunner.runClaude(prompt);

    mockChild.stdout.emit('data', Buffer.from(output));
    setTimeout(() => mockChild.emit('close', 1), 10);

    const result = await resultPromise;

    expect(result.success).toBe(true); // Success because stdout has content
    expect(result.output).toBe(output);
  });

  test('returns failure when exit code non-zero and no output', async () => {
    const prompt = 'Test prompt';

    const resultPromise = claudeRunner.runClaude(prompt);

    setTimeout(() => mockChild.emit('close', 1), 10);

    const result = await resultPromise;

    expect(result.success).toBe(false);
    expect(result.output).toContain('exited with code 1');
  });
});

describe('runClaude - structured output parsing', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockChild = createMockChildProcess();
    childProcess.spawn.mockReturnValue(mockChild);
  });

  test('parses JSON from markdown code fence', async () => {
    const prompt = 'Test prompt';
    const output = `Here is the result:

\`\`\`json
{"action":"work","prompt":"Do something","reason":"Because"}
\`\`\`

That's the decision.`;

    const resultPromise = claudeRunner.runClaude(prompt);

    mockChild.stdout.emit('data', Buffer.from(output));
    setTimeout(() => mockChild.emit('close', 0), 10);

    const result = await resultPromise;

    expect(result.structured).toEqual({
      action: 'work',
      prompt: 'Do something',
      reason: 'Because',
    });
  });

  test('parses JSON from code fence without json language tag', async () => {
    const prompt = 'Test prompt';
    const output = `Result:

\`\`\`
{"status":"done","data":{"count":42}}
\`\`\``;

    const resultPromise = claudeRunner.runClaude(prompt);

    mockChild.stdout.emit('data', Buffer.from(output));
    setTimeout(() => mockChild.emit('close', 0), 10);

    const result = await resultPromise;

    expect(result.structured).toEqual({
      status: 'done',
      data: { count: 42 },
    });
  });

  test('parses JSON with flexible pattern matching (action field)', async () => {
    const prompt = 'Test prompt';
    const output = `I recommend this action:
{"action":"wait","prompt":null,"reason":"No work available"}
End of response.`;

    const resultPromise = claudeRunner.runClaude(prompt);

    mockChild.stdout.emit('data', Buffer.from(output));
    setTimeout(() => mockChild.emit('close', 0), 10);

    const result = await resultPromise;

    expect(result.structured).toEqual({
      action: 'wait',
      prompt: null,
      reason: 'No work available',
    });
  });

  test('parses JSON from last line when no code fence', async () => {
    const prompt = 'Test prompt';
    const output = `Some text here
Another line
{"result":"success","value":123}`;

    const resultPromise = claudeRunner.runClaude(prompt);

    mockChild.stdout.emit('data', Buffer.from(output));
    setTimeout(() => mockChild.emit('close', 0), 10);

    const result = await resultPromise;

    expect(result.structured).toEqual({
      result: 'success',
      value: 123,
    });
  });

  test('parses array JSON from last line', async () => {
    const prompt = 'Test prompt';
    const output = `Here are the results:
[{"id":1,"name":"First"},{"id":2,"name":"Second"}]`;

    const resultPromise = claudeRunner.runClaude(prompt);

    mockChild.stdout.emit('data', Buffer.from(output));
    setTimeout(() => mockChild.emit('close', 0), 10);

    const result = await resultPromise;

    expect(result.structured).toEqual([
      { id: 1, name: 'First' },
      { id: 2, name: 'Second' },
    ]);
  });

  test('returns null structured when no valid JSON found', async () => {
    const prompt = 'Test prompt';
    const output = 'Just plain text with no JSON anywhere';

    const resultPromise = claudeRunner.runClaude(prompt);

    mockChild.stdout.emit('data', Buffer.from(output));
    setTimeout(() => mockChild.emit('close', 0), 10);

    const result = await resultPromise;

    expect(result.structured).toBeNull();
  });

  test('returns null structured when JSON is malformed', async () => {
    const prompt = 'Test prompt';
    const output = `\`\`\`json
{"action":"work", invalid json here}
\`\`\``;

    const resultPromise = claudeRunner.runClaude(prompt);

    mockChild.stdout.emit('data', Buffer.from(output));
    setTimeout(() => mockChild.emit('close', 0), 10);

    const result = await resultPromise;

    expect(result.structured).toBeNull();
  });

  test('handles empty output', async () => {
    const prompt = 'Test prompt';

    const resultPromise = claudeRunner.runClaude(prompt);

    setTimeout(() => mockChild.emit('close', 0), 10);

    const result = await resultPromise;

    expect(result.output).toContain('exited with code 0, no output');
    expect(result.structured).toBeNull();
  });

  test('handles whitespace-only output', async () => {
    const prompt = 'Test prompt';
    const output = '   \n\n   \t  \n';

    const resultPromise = claudeRunner.runClaude(prompt);

    mockChild.stdout.emit('data', Buffer.from(output));
    setTimeout(() => mockChild.emit('close', 0), 10);

    const result = await resultPromise;

    expect(result.output).toContain('exited with code 0, no output');
    expect(result.structured).toBeNull();
  });
});

describe('runClaude - timeout handling', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    mockChild = createMockChildProcess();
    childProcess.spawn.mockReturnValue(mockChild);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('times out after specified duration', async () => {
    const prompt = 'Test prompt';
    const timeoutMs = 5000;

    const resultPromise = claudeRunner.runClaude(prompt, { timeoutMs });

    // Fast-forward time to trigger timeout
    jest.advanceTimersByTime(timeoutMs);

    const result = await resultPromise;

    expect(result.success).toBe(false);
    expect(result.output).toContain('Task timed out after');
    expect(result.output).toContain('0 minutes');
    expect(result.structured).toBeNull();
    expect(mockChild.kill).toHaveBeenCalledWith('SIGTERM');
  });

  test('does not timeout when process completes in time', async () => {
    const prompt = 'Test prompt';
    const timeoutMs = 10000;

    const resultPromise = claudeRunner.runClaude(prompt, { timeoutMs });

    // Complete the process before timeout
    mockChild.stdout.emit('data', Buffer.from('Success'));
    mockChild.emit('close', 0);

    // Fast-forward time but process already closed
    jest.advanceTimersByTime(timeoutMs);

    const result = await resultPromise;

    expect(result.success).toBe(true);
    expect(result.output).toBe('Success');
    expect(mockChild.kill).not.toHaveBeenCalled();
  });

  test('uses default timeout when not specified', async () => {
    const prompt = 'Test prompt';

    const resultPromise = claudeRunner.runClaude(prompt);

    // Should use DEFAULT_TIMEOUT_MS = 600000 (10 minutes)
    jest.advanceTimersByTime(600000);

    const result = await resultPromise;

    expect(result.success).toBe(false);
    expect(result.output).toContain('Task timed out after 10 minutes');
  });

  test('ignores close event after timeout', async () => {
    const prompt = 'Test prompt';
    const timeoutMs = 1000;

    const resultPromise = claudeRunner.runClaude(prompt, { timeoutMs });

    // Trigger timeout
    jest.advanceTimersByTime(timeoutMs);
    const result = await resultPromise;

    expect(result.output).toContain('timed out');

    // Now try to emit close event - should be ignored
    mockChild.stdout.emit('data', Buffer.from('Late output'));
    mockChild.emit('close', 0);

    // Result should still be the timeout result
    expect(result.output).toContain('timed out');
  });
});

describe('runClaude - error handling', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockChild = createMockChildProcess();
    childProcess.spawn.mockReturnValue(mockChild);
  });

  test('handles spawn error event', async () => {
    const prompt = 'Test prompt';

    const resultPromise = claudeRunner.runClaude(prompt);

    setTimeout(() => {
      mockChild.emit('error', new Error('ENOENT: command not found'));
    }, 10);

    const result = await resultPromise;

    expect(result.success).toBe(false);
    expect(result.output).toContain('Could not start Claude');
    expect(result.output).toContain('ENOENT');
    expect(result.structured).toBeNull();
  });

  test('handles permission denied error', async () => {
    const prompt = 'Test prompt';

    const resultPromise = claudeRunner.runClaude(prompt);

    setTimeout(() => {
      mockChild.emit('error', new Error('EACCES: permission denied'));
    }, 10);

    const result = await resultPromise;

    expect(result.success).toBe(false);
    expect(result.output).toContain('Could not start Claude');
    expect(result.output).toContain('EACCES');
  });

  test('clears timeout on error', async () => {
    jest.useFakeTimers();
    const prompt = 'Test prompt';

    const resultPromise = claudeRunner.runClaude(prompt, { timeoutMs: 10000 });

    mockChild.emit('error', new Error('Test error'));

    const result = await resultPromise;

    expect(result.success).toBe(false);

    // Advance time - timeout should not fire since error already resolved
    jest.advanceTimersByTime(10000);

    jest.useRealTimers();
  });
});

describe('runClaude - model selection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockChild = createMockChildProcess();
    childProcess.spawn.mockReturnValue(mockChild);
  });

  test('uses sonnet model by default', async () => {
    const prompt = 'Test prompt';

    const resultPromise = claudeRunner.runClaude(prompt);

    setTimeout(() => {
      mockChild.stdout.emit('data', Buffer.from('output'));
      mockChild.emit('close', 0);
    }, 10);

    await resultPromise;

    const spawnArgs = childProcess.spawn.mock.calls[0][1];
    expect(spawnArgs).toContain('--model');
    expect(spawnArgs).toContain('claude-sonnet-4-5');
  });

  test('uses opus model when specified', async () => {
    const prompt = 'Test prompt';

    const resultPromise = claudeRunner.runClaude(prompt, { model: 'opus' });

    setTimeout(() => {
      mockChild.stdout.emit('data', Buffer.from('output'));
      mockChild.emit('close', 0);
    }, 10);

    await resultPromise;

    const spawnArgs = childProcess.spawn.mock.calls[0][1];
    expect(spawnArgs).toContain('claude-opus-4-6');
  });

  test('uses haiku model when specified', async () => {
    const prompt = 'Test prompt';

    const resultPromise = claudeRunner.runClaude(prompt, { model: 'haiku' });

    setTimeout(() => {
      mockChild.stdout.emit('data', Buffer.from('output'));
      mockChild.emit('close', 0);
    }, 10);

    await resultPromise;

    const spawnArgs = childProcess.spawn.mock.calls[0][1];
    expect(spawnArgs).toContain('claude-haiku-4-5-20251001');
  });

  test('accepts full model name directly', async () => {
    const prompt = 'Test prompt';
    const customModel = 'claude-custom-model-name';

    const resultPromise = claudeRunner.runClaude(prompt, { model: customModel });

    setTimeout(() => {
      mockChild.stdout.emit('data', Buffer.from('output'));
      mockChild.emit('close', 0);
    }, 10);

    await resultPromise;

    const spawnArgs = childProcess.spawn.mock.calls[0][1];
    expect(spawnArgs).toContain(customModel);
  });
});

describe('runClaude - custom options', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockChild = createMockChildProcess();
    childProcess.spawn.mockReturnValue(mockChild);
  });

  test('uses custom working directory when provided', async () => {
    const prompt = 'Test prompt';
    const customCwd = '/custom/working/directory';

    const resultPromise = claudeRunner.runClaude(prompt, { cwd: customCwd });

    setTimeout(() => {
      mockChild.stdout.emit('data', Buffer.from('output'));
      mockChild.emit('close', 0);
    }, 10);

    await resultPromise;

    const spawnOptions = childProcess.spawn.mock.calls[0][2];
    expect(spawnOptions.cwd).toBe(customCwd);
  });

  test('uses custom claude command when provided', async () => {
    const prompt = 'Test prompt';
    const customCmd = '/usr/local/bin/custom-claude';

    const resultPromise = claudeRunner.runClaude(prompt, { claudeCmd: customCmd });

    setTimeout(() => {
      mockChild.stdout.emit('data', Buffer.from('output'));
      mockChild.emit('close', 0);
    }, 10);

    await resultPromise;

    const spawnCmd = childProcess.spawn.mock.calls[0][0];
    expect(spawnCmd).toBe(customCmd);
  });

  test('preserves environment variables', async () => {
    const prompt = 'Test prompt';

    const resultPromise = claudeRunner.runClaude(prompt);

    setTimeout(() => {
      mockChild.stdout.emit('data', Buffer.from('output'));
      mockChild.emit('close', 0);
    }, 10);

    await resultPromise;

    const spawnOptions = childProcess.spawn.mock.calls[0][2];
    expect(spawnOptions.env).toEqual(expect.objectContaining(process.env));
  });
});

describe('runClaude - complex scenarios', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockChild = createMockChildProcess();
    childProcess.spawn.mockReturnValue(mockChild);
  });

  test('handles multiline JSON in code fence', async () => {
    const prompt = 'Test prompt';
    const output = `\`\`\`json
{
  "action": "work",
  "prompt": "This is a long prompt that spans multiple lines and includes various details about the task",
  "reason": "Complex reasoning that also spans multiple lines",
  "metadata": {
    "priority": "high",
    "tags": ["feature", "important"]
  }
}
\`\`\``;

    const resultPromise = claudeRunner.runClaude(prompt);

    mockChild.stdout.emit('data', Buffer.from(output));
    setTimeout(() => mockChild.emit('close', 0), 10);

    const result = await resultPromise;

    expect(result.structured).toEqual({
      action: 'work',
      prompt: expect.stringContaining('long prompt'),
      reason: expect.stringContaining('Complex reasoning'),
      metadata: {
        priority: 'high',
        tags: ['feature', 'important'],
      },
    });
  });

  test('prioritizes code fence over last line JSON', async () => {
    const prompt = 'Test prompt';
    const output = `Here is the decision:

\`\`\`json
{"source":"code-fence","value":1}
\`\`\`

And here's another JSON on last line:
{"source":"last-line","value":2}`;

    const resultPromise = claudeRunner.runClaude(prompt);

    mockChild.stdout.emit('data', Buffer.from(output));
    setTimeout(() => mockChild.emit('close', 0), 10);

    const result = await resultPromise;

    // Code fence should be parsed first
    expect(result.structured).toEqual({
      source: 'code-fence',
      value: 1,
    });
  });

  test('falls back to last line when code fence is malformed', async () => {
    const prompt = 'Test prompt';
    const output = `\`\`\`json
{malformed json}
\`\`\`

But here's a valid one on the last line:
{"action":"work","prompt":"Valid prompt","reason":"Good reason"}`;

    const resultPromise = claudeRunner.runClaude(prompt);

    mockChild.stdout.emit('data', Buffer.from(output));
    setTimeout(() => mockChild.emit('close', 0), 10);

    const result = await resultPromise;

    expect(result.structured).toEqual({
      action: 'work',
      prompt: 'Valid prompt',
      reason: 'Good reason',
    });
  });

  test('handles very large output efficiently', async () => {
    const prompt = 'Test prompt';
    const largeText = 'x'.repeat(100000);
    const output = `${largeText}\n{"result":"success"}`;

    const resultPromise = claudeRunner.runClaude(prompt);

    // Emit in chunks to simulate real streaming
    const chunkSize = 10000;
    for (let i = 0; i < output.length; i += chunkSize) {
      mockChild.stdout.emit('data', Buffer.from(output.slice(i, i + chunkSize)));
    }

    setTimeout(() => mockChild.emit('close', 0), 10);

    const result = await resultPromise;

    expect(result.output.length).toBeGreaterThan(100000);
    expect(result.structured).toEqual({ result: 'success' });
  });

  test('handles concurrent stdout and stderr streams', async () => {
    const prompt = 'Test prompt';

    const resultPromise = claudeRunner.runClaude(prompt);

    mockChild.stdout.emit('data', Buffer.from('stdout line 1\n'));
    mockChild.stderr.emit('data', Buffer.from('stderr line 1\n'));
    mockChild.stdout.emit('data', Buffer.from('stdout line 2\n'));
    mockChild.stderr.emit('data', Buffer.from('stderr line 2\n'));

    setTimeout(() => mockChild.emit('close', 0), 10);

    const result = await resultPromise;

    // stdout should be preferred when both exist
    expect(result.output).toContain('stdout line 1');
    expect(result.output).toContain('stdout line 2');
    expect(result.output).not.toContain('stderr');
  });
});
