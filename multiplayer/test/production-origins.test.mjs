import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

const run = (allowed) => new Promise((resolve, reject) => {
  const child = spawn(process.execPath, ['server.mjs'], {
    cwd: new URL('..', import.meta.url),
    env: { ...process.env, NODE_ENV: 'production', ALLOWED_ORIGINS: allowed, PORT: '0' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let output = '';
  const timeout = setTimeout(() => { child.kill(); reject(new Error('relay startup timed out')); }, 4000);
  child.stdout.on('data', chunk => {
    output += chunk;
    if (output.includes('listening on port')) { clearTimeout(timeout); child.kill(); resolve({ started: true }); }
  });
  child.stderr.on('data', chunk => { output += chunk; });
  child.on('error', error => { clearTimeout(timeout); reject(error); });
  child.on('exit', code => {
    clearTimeout(timeout);
    if (!output.includes('listening on port')) resolve({ started: false, code, output });
  });
});

test('production rejects invalid and insecure origin allowlists', async () => {
  for (const origin of ['', 'http://example.com', '*', 'https://*.example.com',
    'https://example.com/path', 'https://user:pass@example.com', 'not-an-origin']) {
    const result = await run(origin);
    assert.equal(result.started, false, origin);
    assert.notEqual(result.code, 0, origin);
  }
});

test('production starts with an exact HTTPS origin', async () => {
  assert.equal((await run('https://example.com')).started, true);
});
