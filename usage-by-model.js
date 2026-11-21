/**
 * Per-route provider usage folded over one Session's whole durable log.
 *
 * The host publishes this as the `usageByModel` session projection so the
 * client can answer "which models did this conversation use, and how much did
 * each one consume" without paging a loaded window.
 *
 * Attribution follows the token-meter unit's semantics: a settlement's usage is
 * the last `usage` chunk of its stream (or `data.usage`), the replacement slot
 * is keyed by `turn`/`step`, and `llm/retry-started` closes that slot so a
 * retried attempt is counted on its own. The route comes from the latest
 * `request/header` snapshot — a snapshot, not a request counter: `request/header`
 * is only appended on `initial`/`resume`/`change`/`series`, so this fold never
 * reports a request count, only settlements that carried provider usage.
 */

/** Key under which the host registers this unit. */
export const USAGE_BY_MODEL_KEY = 'usageByModel';

/** Route recorded before any `request/header` was seen (imported or truncated history). */
const UNKNOWN_PROVIDER = '未知';
const UNKNOWN_MODEL = '未记录';

/**
 * Accepts a state or view unchanged. The projection registry only calls
 * `parse` on the way in and out; this unit's shapes are plain JSON data, so a
 * validating schema would add a dependency without adding a check.
 */
const passThrough = Object.freeze({
  parse: (value) => value,
});

const zeroBuckets = () => ({
  uncachedInputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  steps: 0,
});

const finite = (value) => typeof value === 'number' && Number.isFinite(value) && value > 0;

const routeKey = (provider, model) => `${provider}\u0000${model}`;

/** The usage one durable Assistant settlement reports for its attempt, if any. */
export function usageOfEvent(event) {
  if (event?.type === 'assistant/message' && event.data?.usage) return event.data.usage;
  if (event?.type !== 'assistant/message' && event?.type !== 'assistant/attempt') return undefined;
  const stream = event.data?.stream;
  if (!Array.isArray(stream)) return undefined;
  for (let index = stream.length - 1; index >= 0; index -= 1) {
    const record = stream[index];
    if (record?.type === 'chunk' && record.chunk?.type === 'usage' && record.chunk.usage) return record.chunk.usage;
  }
  return undefined;
}

/** @returns the projection's initial value. */
export const initUsageByModel = () => ({ provider: null, model: null, models: {}, last: null, groupSteps: [] });

const bucketsOf = (usage) => ({
  uncachedInputTokens: finite(usage.inputTokens) ? usage.inputTokens : 0,
  outputTokens: finite(usage.outputTokens) ? usage.outputTokens : 0,
  cacheReadTokens: finite(usage.cacheReadTokens) ? usage.cacheReadTokens : 0,
  cacheWriteTokens: finite(usage.cacheWriteTokens) ? usage.cacheWriteTokens : 0,
});

const sameBuckets = (left, right) =>
  left.uncachedInputTokens === right.uncachedInputTokens
  && left.outputTokens === right.outputTokens
  && left.cacheReadTokens === right.cacheReadTokens
  && left.cacheWriteTokens === right.cacheWriteTokens;

/**
 * Fold one Session event into the per-route usage state.
 * @param state - previous state of this unit.
 * @param event - one committed Session event.
 * @returns the next state, or the same reference when nothing changed.
 */
export function applyUsageByModelEvent(state, event) {
  if (event?.type === 'request/header') {
    const config = event.data?.header?.config;
    const provider = config?.provider ?? UNKNOWN_PROVIDER;
    const model = config?.model ?? UNKNOWN_MODEL;
    if (provider === state.provider && model === state.model) return state;
    return { ...state, provider, model };
  }
  if (event?.type === 'llm/retry-started') {
    const last = state.last;
    if (last === null) return state;
    return last.turn === event.data?.turn && last.step === event.data?.step ? { ...state, last: null } : state;
  }
  if (event?.type !== 'assistant/message' && event?.type !== 'assistant/attempt') return state;
  const usage = usageOfEvent(event);
  if (usage === undefined) return state;
  const turn = event.data?.turn;
  const step = event.data?.step;
  if (!Number.isInteger(turn) || !Number.isInteger(step)) return state;

  const provider = state.provider ?? UNKNOWN_PROVIDER;
  const model = state.model ?? UNKNOWN_MODEL;
  const key = routeKey(provider, model);
  const buckets = bucketsOf(usage);

  const last = state.last;
  const replaced = last !== null && last.turn === turn && last.step === step ? last : null;
  if (replaced !== null && replaced.key === key && sameBuckets(replaced.buckets, buckets)) return state;

  const models = { ...state.models };
  if (replaced !== null) {
    const prior = models[replaced.key];
    if (prior) {
      models[replaced.key] = {
        ...prior,
        uncachedInputTokens: prior.uncachedInputTokens - replaced.buckets.uncachedInputTokens,
        outputTokens: prior.outputTokens - replaced.buckets.outputTokens,
        cacheReadTokens: prior.cacheReadTokens - replaced.buckets.cacheReadTokens,
        cacheWriteTokens: prior.cacheWriteTokens - replaced.buckets.cacheWriteTokens,
        steps: Math.max(0, prior.steps - 1),
      };
    }
  }
  const current = models[key] ?? { provider, model, ...zeroBuckets() };
  models[key] = {
    ...current,
    uncachedInputTokens: current.uncachedInputTokens + buckets.uncachedInputTokens,
    outputTokens: current.outputTokens + buckets.outputTokens,
    cacheReadTokens: current.cacheReadTokens + buckets.cacheReadTokens,
    cacheWriteTokens: current.cacheWriteTokens + buckets.cacheWriteTokens,
    steps: current.steps + 1,
  };

  const priorGroupSteps = Array.isArray(state.groupSteps) ? state.groupSteps : [];
  const nextGroupSteps = priorGroupSteps.slice();
  if (replaced !== null && replaced.hadGroupStep && nextGroupSteps.length > 0) {
    nextGroupSteps.pop();
  }
  const isGroup = model.startsWith('group/');
  if (isGroup) {
    nextGroupSteps.push({
      req: model,
      time: typeof event.time === 'number' && Number.isFinite(event.time) ? event.time : null,
      in: buckets.uncachedInputTokens,
      out: buckets.outputTokens,
      cacheRead: buckets.cacheReadTokens,
      cacheWrite: buckets.cacheWriteTokens,
    });
  }

  return {
    ...state,
    models,
    groupSteps: nextGroupSteps,
    last: { turn, step, key, buckets, hadGroupStep: isGroup },
  };
}

const totalOf = (entry) =>
  entry.uncachedInputTokens + entry.outputTokens + entry.cacheReadTokens + entry.cacheWriteTokens;

/**
 * Turn the fold state into the client view.
 * @param state - whole-log per-route state.
 * @returns routes sorted by consumed tokens, largest first, plus the live route.
 */
export function viewUsageByModel(state) {
  const models = Object.values(state.models ?? {})
    .filter((entry) => totalOf(entry) > 0)
    .map((entry) => ({ ...entry, tokens: totalOf(entry) }))
    .sort((left, right) => right.tokens - left.tokens);
  const total = models.reduce((sum, entry) => sum + entry.tokens, 0);
  return {
    current: state.provider === null ? null : { provider: state.provider, model: state.model },
    total,
    models,
  };
}

/** Registration ready for `ctx.sessionProjections.register()`. */
export const usageByModelProjection = {
  key: USAGE_BY_MODEL_KEY,
  stateVersion: 2,
  stateSchema: passThrough,
  init: initUsageByModel,
  apply: applyUsageByModelEvent,
  wire: {
    viewSchema: passThrough,
    view: viewUsageByModel,
    // Per-model rows belong to the open Session, not to every session-list summary.
    summary: false,
  },
};
