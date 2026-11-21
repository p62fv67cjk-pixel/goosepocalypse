import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

test('production relay refuses to start without an allowed browser origin', async () => {
  const child = spawn(process.execPath, ['server.mjs'], {
    cwd: new URL('..', import.meta.url),
    env: { ...process.env, NODE_ENV: 'production', ALLOWED_ORIGINS: '' },
    stdio: ['ignore', 'ignore', 'pipe']
  });
  let stderr = '';
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', chunk => { stderr += chunk; });
  const result = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error('Misconfigured production relay did not exit'));
    }, 3000);
    child.once('error', error => { clearTimeout(timeout); reject(error); });
    child.once('exit', (code, signal) => {
      clearTimeout(timeout);
      resolve({ code, signal });
    });
  });
  assert.equal(result.code, 1);
  assert.equal(result.signal, null);
  assert.match(stderr, /ALLOWED_ORIGINS must contain only exact HTTPS game origins in production/);
});
