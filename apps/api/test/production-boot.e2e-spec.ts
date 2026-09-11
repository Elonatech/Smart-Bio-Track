import { execFileSync } from 'child_process';
import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import * as path from 'path';
import request from 'supertest';

/**
 * Boots the COMPILED output the way Render does — `node dist/main` — rather
 * than building a Nest app from TypeScript source in-process.
 *
 * Every other e2e spec goes through createTestApp(), which ts-jest compiles
 * on the fly. That path never touches dist/, so nothing in the suite
 * exercised the production entrypoint at all — the gap this spec closes.
 *
 * It also pins down a packaging rule the boot check alone cannot enforce.
 * @smartbiotrack/constants shipped with `"main": "index.ts"`, pointing the
 * compiled API at a TypeScript source file. Whether that survives depends
 * on the Node version: 22.14 strips the types and loads it, older releases
 * parse it as CommonJS and die on the `export` keyword. Booting green on a
 * developer's Node therefore proves nothing about the deploy target, so
 * `resolves its workspace imports to compiled JavaScript` asserts the
 * entrypoint's extension directly — a check no runtime can paper over.
 */

const REPO_ROOT = path.resolve(__dirname, '../../..');
const API_ROOT = path.resolve(__dirname, '..');

// Deliberately not 4000. A dev server left running must not make this spec
// pass by answering in the child's place, nor fail it with EADDRINUSE.
const PORT = 4123;
const READY_LOG = 'Server is running';
const BOOT_TIMEOUT_MS = 60_000;

describe('production boot (e2e)', () => {
  let child: ChildProcessWithoutNullStreams;
  let output = '';

  beforeAll(async () => {
    // Build here rather than trusting whatever dist happens to be lying
    // around: a stale dist from before a breaking change would give a
    // false pass. Turbo caches this, so repeat runs are near-instant.
    execFileSync(
      'pnpm',
      ['turbo', 'run', 'build', '--filter=api...'],
      { cwd: REPO_ROOT, stdio: 'pipe', shell: process.platform === 'win32' },
    );

    child = spawn(process.execPath, ['dist/main'], {
      cwd: API_ROOT,
      env: { ...process.env, PORT: String(PORT) },
    });

    child.stdout.on('data', (chunk: Buffer) => (output += chunk.toString()));
    child.stderr.on('data', (chunk: Buffer) => (output += chunk.toString()));

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () =>
          reject(
            new Error(
              `dist/main did not log "${READY_LOG}" within ${BOOT_TIMEOUT_MS}ms.\n` +
                `--- child output ---\n${output}`,
            ),
          ),
        BOOT_TIMEOUT_MS,
      );

      child.stdout.on('data', () => {
        if (output.includes(READY_LOG)) {
          clearTimeout(timer);
          resolve();
        }
      });

      // The failure mode we actually care about: the process dies during
      // startup instead of hanging. Surface its output, which is where the
      // real cause (a require() that cannot resolve) is printed.
      child.on('exit', (code) => {
        clearTimeout(timer);
        reject(
          new Error(
            `dist/main exited with code ${code} before finishing startup.\n` +
              `--- child output ---\n${output}`,
          ),
        );
      });

      child.on('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });
  }, BOOT_TIMEOUT_MS + 240_000);

  afterAll(() => {
    child?.kill();
  });

  it('serves the compiled app over HTTP', async () => {
    const res = await request(`http://127.0.0.1:${PORT}`).get('/api');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('mounts the auth routes, which load the workspace-package DTOs', async () => {
    // /api/auth/me needs a token, and 401 is the correct answer without
    // one. The point is that it answers at all: AuthController cannot mount
    // unless its DTOs — and the @smartbiotrack/constants import inside them
    // — resolved from the compiled output. A packaging fault shows up as
    // the whole process failing to start, caught in beforeAll above.
    const res = await request(`http://127.0.0.1:${PORT}`).get('/api/auth/me');

    expect(res.status).toBe(401);
  });

  it('resolves its workspace imports to compiled JavaScript', () => {
    // Resolved the way the compiled app resolves it — from inside dist —
    // not from this spec's own location.
    const entry = require.resolve('@smartbiotrack/constants', {
      paths: [path.join(API_ROOT, 'dist')],
    });

    expect(path.extname(entry)).toBe('.js');
  });
});
