import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readMagpieQuotas } from './quotas.js';
import { readMagpieRoutes } from './magpie-routes.js';
import { usageByModelProjection } from './usage-by-model.js';
import { readResetCards, useResetCard } from './reset-cards.js';

function resolveMagpieCommand() {
  if (process.env.MAGPIE_BIN) return process.env.MAGPIE_BIN;
  if (process.platform === 'darwin') {
    for (const candidate of [
      '/Applications/magpie.app/Contents/MacOS/magpie',
      '/Applications/Magpie.app/Contents/MacOS/magpie',
    ]) {
      if (existsSync(candidate)) return candidate;
    }
  }
  return 'magpie';
}

export function apply(ctx) {
  let checkinRunning = false;
  let usageHandle = null;
  let getSession = null;

  ctx.inject(['sessions'], (c) => {
    getSession = typeof c.sessions?.get === 'function' ? (id) => c.sessions.get(id) : null;
    return () => { getSession = null; };
  });

  // Forward the DSH session id to the local Magpie gateway so usage.jsonl
  // keeps exact session attribution even on OpenAI-compatible group routes.
  if (typeof ctx.on === 'function') {
    ctx.on('llm-pi-ai/request-headers', (request, headers, next) => {
      if (
        typeof request?.sessionId === 'string' &&
        request.sessionId &&
        typeof request?.baseURL === 'string' &&
        /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?(\/|$)/i.test(request.baseURL) &&
        !headers.has('x-deepseek-harness-session-id')
      ) {
        headers.set('x-deepseek-harness-session-id', request.sessionId);
      }
      return next();
    });
  }

  // Whole-log per-route usage: the client view answers "which models did this
  // conversation use, and how much did each consume" without paging a window.
  ctx.inject(['sessionProjections'], (c) => {
    c.effect(() => {
      let released = false;
      let handle = null;
      void c.sessionProjections.register(usageByModelProjection).then((registered) => {
        handle = registered;
        usageHandle = registered;
        if (released) {
          if (usageHandle === registered) usageHandle = null;
          void registered.dispose();
        }
      }, (error) => c.logger?.error?.('usage-rings: usage-by-model projection failed', error));
      return () => {
        released = true;
        if (handle !== null) {
          if (usageHandle === handle) usageHandle = null;
          void handle.dispose();
        }
      };
    }, 'usage-rings: usage by model projection');
  });

  ctx.inject(['connection'], (c) => {
    c.effect(() => c.connection.fetch.register({
      path: '/api/dsh-usage-rings/status',
      methods: ['POST'],
      requestBody: 'buffered',
      async fetch(request) {
        let body;
        try {
          body = await request.json();
        } catch {
          return new Response('invalid JSON', { status: 400 });
        }
        return Response.json({
          type: 'server-response',
          rpcId: body?.rpcId,
          result: { ok: true, value: await readMagpieQuotas() },
        });
      },
    }), 'usage-rings: quota status');
  });

  ctx.inject(['connection'], (c) => {
    c.effect(() => c.connection.fetch.register({
      path: '/api/dsh-usage-rings/workbuddy-checkin',
      methods: ['POST'],
      requestBody: 'buffered',
      async fetch(request) {
        let body;
        try { body = await request.json(); } catch { return new Response('invalid JSON', { status: 400 }); }
        if (checkinRunning) return Response.json({ type: 'server-response', rpcId: body?.rpcId, result: { ok: true, value: { completed: false, busy: true } } });
        checkinRunning = true;
        let completed;
        try {
          completed = await new Promise((resolve) => {
            execFile(resolveMagpieCommand(), ['accounts', 'checkin'], { timeout: 60000, maxBuffer: 65536 }, (error) => resolve(!error));
          });
        } finally { checkinRunning = false; }
        return Response.json({ type: 'server-response', rpcId: body?.rpcId, result: { ok: true, value: { completed } } });
      },
    }), 'usage-rings: workbuddy check-in');
  });

  const isRecord = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  const rpcPayload = (body) => (isRecord(body?.payload) ? body.payload : (isRecord(body) ? body : {}));

  for (const [path, handler] of [
    ['/api/dsh-usage-rings/reset-cards', () => readResetCards()],
    ['/api/dsh-usage-rings/use-reset-card', (body) => useResetCard(rpcPayload(body))],
  ]) {
    ctx.inject(['connection'], (c) => {
      c.effect(() => c.connection.fetch.register({
        path,
        methods: ['POST'],
        requestBody: 'buffered',
        async fetch(request) {
          let body;
          try { body = await request.json(); } catch { return new Response('invalid JSON', { status: 400 }); }
          const value = await handler(body);
          return Response.json({ type: 'server-response', rpcId: body?.rpcId, result: { ok: path.endsWith('/reset-cards') ? !value.error : true, value } });
        },
      }), `usage-rings: ${path}`);
    });
  }

  ctx.inject(['connection'], (c) => {
    c.effect(() => c.connection.fetch.register({
      path: '/api/dsh-usage-rings/magpie-routes',
      methods: ['POST'],
      requestBody: 'buffered',
      async fetch(request) {
        let body;
        try {
          body = await request.json();
        } catch {
          return new Response('invalid JSON', { status: 400 });
        }
        const payload = rpcPayload(body);
        const sessionId = typeof payload.sessionId === 'string' && payload.sessionId ? payload.sessionId : undefined;
        let groupSteps;
        try {
          const session = sessionId && getSession ? getSession(sessionId) : null;
          groupSteps = session && usageHandle ? usageHandle.stateOf(session)?.groupSteps : undefined;
        } catch {
          groupSteps = undefined;
        }
        return Response.json({
          type: 'server-response',
          rpcId: body?.rpcId,
          result: { ok: true, value: await readMagpieRoutes(sessionId, { groupSteps }) },
        });
      },
    }), 'usage-rings: magpie routes');
  });
}
