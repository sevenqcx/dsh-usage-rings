/**
 * Resolve Magpie's per-request routing decisions for one DSH session.
 *
 * DSH's own session log records a group route as `group/smart-split` and never
 * writes back which concrete model actually served the request. Magpie's local
 * gateway keeps that decision in `~/.config/magpie/usage.jsonl`: one JSON line
 * per settled request, with `req` (the requested route, e.g. `group/smart-split`)
 * and `served` (the concrete model that answered, e.g. `gemini-4-hydrogen`).
 *
 * This module reads that file, keeps only the rows for the requested session,
 * and folds each group route into a per-concrete-model usage summary so the
 * client can show "group/smart-split" expanded into the models it actually
 * routed to, instead of leaving the group name opaque.
 */
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

const USAGE_PATH = join(homedir(), '.config', 'magpie', 'usage.jsonl');

/** A request counted even when a settlement reported no tokens at all. */
const finite = (value) => typeof value === 'number' && Number.isFinite(value) && value > 0;
const countOf = (value) => (finite(value) ? value : 0);

/**
 * DSH hands the client a session id either bare (`9094ed7c-…`) or with the
 * `session-` prefix (`session-3369b4a6-…`) depending on the workspace, while
 * Magpie records whatever the client sent. Compare on the bare id only.
 */
const bareSession = (id) => (typeof id === 'string' ? id.replace(/^session-/, '') : '');

const isGroupRoute = (req) => typeof req === 'string' && req.startsWith('group/');

const servedOf = (row) => (
  typeof row?.served === 'string' && row.served
    ? row.served
    : (typeof row?.model === 'string' && row.model ? row.model : '未记录')
);

const providerOf = (row) => (typeof row?.provider === 'string' && row.provider ? row.provider : '未知');

const finishTimeOf = (row) => {
  const started = typeof row?.t === 'string' ? Date.parse(row.t) : NaN;
  if (!Number.isFinite(started)) return null;
  return started + countOf(row.ms);
};

const tokenSignature = (req, inTok, outTok, cacheRead, cacheWrite) =>
  `${req}\u0000${inTok}\u0000${outTok}\u0000${cacheRead}\u0000${cacheWrite}`;

function addRowToGroup(groups, row) {
  const provider = providerOf(row);
  const served = servedOf(row);
  const key = `${provider}\u0000${served}`;

  let group = groups.get(row.req);
  if (!group) {
    group = { byModel: new Map(), last: null, lastTs: -Infinity };
    groups.set(row.req, group);
  }
  const prior = group.byModel.get(key) ?? {
    provider,
    model: served,
    uncachedInputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    calls: 0,
  };
  prior.uncachedInputTokens += countOf(row.in);
  prior.outputTokens += countOf(row.out);
  prior.cacheReadTokens += countOf(row.cache_read);
  prior.cacheWriteTokens += countOf(row.cache_write);
  prior.calls += 1;
  group.byModel.set(key, prior);

  const ts = finishTimeOf(row) ?? 0;
  if (ts >= group.lastTs) {
    group.lastTs = ts;
    group.last = { provider, model: served };
  }
}

/**
 * Fold one usage.jsonl line into the group→model map when it is a group route
 * belonging to the requested session.
 * @param {Map<string, object>} groups group name → `{ byModel, last, lastTs }`
 * @param {object} row one parsed usage.jsonl line
 * @param {string} sessionId bare DSH session id
 */
export function foldRouteLine(groups, row, sessionId) {
  if (!row || typeof row !== 'object') return;
  if (!isGroupRoute(row.req)) return;
  if (bareSession(row.session) !== bareSession(sessionId)) return;
  addRowToGroup(groups, row);
}

/**
 * Turn the fold map into the client view: each group becomes a list of concrete
 * models sorted by tokens, largest first, plus that group's total and latest served model.
 */
export function viewRoutes(groups) {
  const out = {};
  for (const [groupName, entry] of groups) {
    const byModel = entry instanceof Map ? entry : entry.byModel;
    const models = [...byModel.values()]
      .map((modelEntry) => ({
        ...modelEntry,
        tokens: modelEntry.uncachedInputTokens + modelEntry.outputTokens + modelEntry.cacheReadTokens + modelEntry.cacheWriteTokens,
      }))
      .sort((left, right) => right.tokens - left.tokens);
    out[groupName] = {
      models,
      total: models.reduce((sum, modelEntry) => sum + modelEntry.tokens, 0),
      last: entry instanceof Map ? null : entry.last,
    };
  }
  return out;
}

/**
 * Read Magpie's usage log and resolve every group route for one DSH session
 * into the concrete models it served. Uses exact session id matching first and
 * falls back to token-signature + timestamp matching for sessions whose HTTP
 * requests omitted the session header.
 * @param {string|undefined} sessionId DSH session id (bare or `session-` prefixed)
 * @param {{ groupSteps?: Array<object>, usagePath?: string }} [options]
 * @returns {Promise<object>} `{ groups: { [groupName]: { models, total, last } }, lastServed }`
 */
export async function readMagpieRoutes(sessionId, options = {}) {
  const bare = bareSession(sessionId);
  const groupSteps = Array.isArray(options?.groupSteps) ? options.groupSteps : [];
  if (!bare && groupSteps.length === 0) return { groups: {}, lastServed: null };

  const usagePath = typeof options?.usagePath === 'string' ? options.usagePath : USAGE_PATH;
  let text;
  try {
    text = await readFile(usagePath, 'utf8');
  } catch {
    return { groups: {}, lastServed: null };
  }

  const groups = new Map();
  const exactMatchedKeys = new Map();
  const unattributedByKey = new Map();
  let lastServed = null;
  let lastServedTs = -Infinity;

  const recordMatch = (row) => {
    addRowToGroup(groups, row);
    const ts = finishTimeOf(row) ?? 0;
    if (ts >= lastServedTs) {
      lastServedTs = ts;
      lastServed = { req: row.req, provider: providerOf(row), model: servedOf(row) };
    }
  };

  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    let row;
    try {
      row = JSON.parse(line);
    } catch {
      continue;
    }
    if (!row || typeof row !== 'object' || !isGroupRoute(row.req)) continue;

    if (bare && bareSession(row.session) === bare) {
      recordMatch(row);
      const sig = tokenSignature(row.req, countOf(row.in), countOf(row.out), countOf(row.cache_read), countOf(row.cache_write));
      const ts = finishTimeOf(row);
      if (ts !== null) {
        const list = exactMatchedKeys.get(sig) ?? [];
        list.push(ts);
        exactMatchedKeys.set(sig, list);
      }
      continue;
    }

    if (!row.session && groupSteps.length > 0 && (row.agent === 'dsh' || !row.agent)) {
      const sig = tokenSignature(row.req, countOf(row.in), countOf(row.out), countOf(row.cache_read), countOf(row.cache_write));
      const list = unattributedByKey.get(sig) ?? [];
      list.push({ row, ts: finishTimeOf(row), used: false });
      unattributedByKey.set(sig, list);
    }
  }

  for (const step of groupSteps) {
    if (!step || !isGroupRoute(step.req)) continue;
    const inTok = countOf(step.in);
    const outTok = countOf(step.out);
    const cacheRead = countOf(step.cacheRead);
    const cacheWrite = countOf(step.cacheWrite);
    const sig = tokenSignature(step.req, inTok, outTok, cacheRead, cacheWrite);
    const stepTime = typeof step.time === 'number' && Number.isFinite(step.time) ? step.time : null;

    const exactTimes = exactMatchedKeys.get(sig);
    if (exactTimes && exactTimes.length > 0) {
      const idx = stepTime === null
        ? 0
        : exactTimes.findIndex((ts) => Math.abs(ts - stepTime) <= 180_000);
      if (idx >= 0) {
        exactTimes.splice(idx, 1);
        continue;
      }
    }

    const candidates = unattributedByKey.get(sig);
    if (!candidates || candidates.length === 0) continue;
    const zeroTokens = inTok === 0 && outTok === 0 && cacheRead === 0 && cacheWrite === 0;
    if (zeroTokens && stepTime === null) continue;
    const maxWindow = zeroTokens ? 15_000 : 180_000;

    let best = null;
    let bestDiff = Infinity;
    for (const candidate of candidates) {
      if (candidate.used) continue;
      if (stepTime === null || candidate.ts === null) {
        if (!zeroTokens && best === null) {
          best = candidate;
          bestDiff = 0;
        }
        continue;
      }
      const diff = Math.abs(candidate.ts - stepTime);
      if (diff <= maxWindow && diff < bestDiff) {
        best = candidate;
        bestDiff = diff;
      }
    }
    if (best !== null) {
      best.used = true;
      recordMatch(best.row);
    }
  }

  return { groups: viewRoutes(groups), lastServed };
}
