/**
 * Host half of the Token Pet bundle.
 *
 * Exposes one read-only JSON endpoint that the Client half polls:
 *
 *   GET /plugins/token-pet/state?session=<sessionId>&provider=<workbuddy|workbuddy-ai>
 *
 * It aggregates, for the requested session:
 *   - token usage in this session (durable `assistant/message` usage events and
 *     the live context measurement),
 *   - the credit spend of every logged step, priced from the WorkBuddy model
 *     billing rates that the dsh-workbuddy-connect plugin publishes,
 *   - the remaining WorkBuddy credit, proxied from that plugin's own status
 *     route so the pet never talks to a billing upstream itself.
 *
 * Everything is read-only: no session event is appended, no upstream call is
 * made beyond the sibling plugin's status document.
 */

import { readFile } from 'node:fs/promises';

/** Maximum number of per-step rows returned (the newest are kept). */
const MAX_STEPS = 400;

/**
 * Files are read as UTF-8, but the WorkBuddy package names can contain bytes
 * that are not valid UTF-8. A JSON body must still be valid Unicode; measured
 * `JSON.stringify` -> invalid surrogate pairs survived the pipe, so replace
 * control characters and lone surrogates before answering.
 */
function sanitizeText(value) {
  if (typeof value !== 'string') return value;
  return value
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/gu, ' ')
    .replace(/[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/gu, '\ufffd');
}

/** Replace character data in every string leaf of a JSON value. */
function sanitized(value) {
  if (typeof value === 'string') return sanitizeText(value);
  if (Array.isArray(value)) return value.map(sanitized);
  if (value !== null && typeof value === 'object') {
    const out = {};
    for (const [key, item] of Object.entries(value)) out[sanitizeText(key)] = sanitized(item);
    return out;
  }
  return value;
}

/**
 * Model rates and the remaining credit, read from the sibling WorkBuddy
 * Connect status document. Cached briefly per provider so that polling the pet
 * does not turn into one status fetch per second, and so a transient failure
 * degrades to the previous good value instead of an empty balance.
 */
class WorkBuddyCache {
  constructor(ttlMs = 20_000) {
    this.ttlMs = ttlMs;
    /** @type {Map<string, { at: number, value: unknown }>} */
    this.entries = new Map();
  }

  get(provider) {
    const hit = this.entries.get(provider);
    if (hit !== undefined && Date.now() - hit.at < this.ttlMs) {
      return { value: hit.value, cached: true };
    }
    return undefined;
  }

  set(provider, value) {
    this.entries.set(provider, { at: Date.now(), value });
    return value;
  }
}

/**
 * Split a model billing badge such as `"x0.79 credits"` into a number.
 *
 * @param {unknown} raw
 * @returns {number | undefined}
 */
function parseRate(raw) {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (typeof raw !== 'string') return undefined;
  const match = /(-?\d+(?:\.\d+)?)/.exec(raw);
  if (match === null) return undefined;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : undefined;
}

/**
 * The WorkBuddy billing family a session belongs to.
 *
 * @param {unknown} provider
 * @returns {'cn' | 'ai'}
 */
function billingVariant(provider) {
  return provider === 'workbuddy' ? 'cn' : 'ai';
}

/**
 * Which edition's balance a session spends.
 *
 * A turn that falls back from the domestic account to the international one
 * is billed by the second, so the most recent routing wins and every distinct
 * routing a turn used is reported alongside.
 *
 * @param {any} session
 * @param {string | undefined} fallback
 * @param {any} agent
 * @returns {{ primary: 'cn' | 'ai', active: ('cn' | 'ai')[] }}
 */
function billingsOf(session, fallback, agent) {
  const active = [];
  let last;
  try {
    for (const event of session.snapshotEvents()) {
      const chapter = event?.type;
      const data = event?.data;
      if (chapter === 'turn/start') {
        active.length = 0;
        last = undefined;
      }
      const provider = chapter === 'request/header'
        ? data?.provider
        : chapter === 'request/context'
          ? data?.provider
          : chapter === 'assistant/message'
            ? data?.message?.source?.provider
            : undefined;
      if (provider !== 'workbuddy' && provider !== 'workbuddy-ai') continue;
      last = provider;
    }
  } catch {
    /* a session without a readable log keeps the caller's hint */
  }
  const primary = last === 'workbuddy' ? 'cn' : last === 'workbuddy-ai' ? 'ai' : billingVariant(fallback);
  // The active edition is whichever the running model is billed against; a
  // failed-over turn does not make its own history the current balance.
  return { primary, active: [primary] };
}

/** One JSON answer, cleaned so invalid UTF-8 in package names cannot break it. */
function sendJson(res, payload, status = 200) {
  const body = JSON.stringify(sanitized(payload));
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(body),
  });
  res.end(body);
}

/** Translate one billing rate into credit units. */
function rateOf(models, provider, model) {
  if (!Array.isArray(models) || typeof model !== 'string') return undefined;
  for (const entry of models) {
    if (entry === null || typeof entry !== 'object') continue;
    const candidate = /** @type {Record<string, unknown>} */ (entry);
    const id = candidate['id'] ?? candidate['name'];
    if (id !== model) continue;
    if (candidate['free'] === true) return 0;
    return parseRate(candidate['credits']);
  }
  return undefined;
}

/**
 * Approximate the credits one model call consumed.
 *
 * WorkBuddy prices three disjoint buckets: prompt tokens that missed the
 * cache, prompt tokens served from it, and completion tokens. The constants
 * below were solved against the charges this machine was actually billed
 * through the bridge (24811/0/32 → 0.36 and 784/27136/502 → 0.05, both at a
 * x0.11 model), which is the same pipeline the card reports on, so they
 * describe today's price list rather than the client's older, differently
 * rated history.
 *
 * The completion is the expensive part, a cache hit is nearly free, and a
 * cache miss costs about 20× a hit. A model billed at zero credits — a free
 * preview — spends nothing regardless.
 */
const PRICE_PER_MILLION = { prompt: 131, cache: 6, output: 380 };

function creditsForStep(usage, rate) {
  if (rate === undefined) return undefined;
  if (rate === 0) return 0;
  // The usage buckets are disjoint: `inputTokens` is the part of the prompt
  // that missed the cache, `cacheReadTokens` the part that hit it. A step that
  // read 200k from cache and sent 217 fresh tokens reports exactly that.
  const uncached = Math.max(0, usage.inputTokens ?? 0);
  const cacheRead = Math.max(0, usage.cacheReadTokens ?? 0);
  const output = Math.max(0, usage.outputTokens ?? 0);
  const billed = uncached * PRICE_PER_MILLION.prompt
    + cacheRead * PRICE_PER_MILLION.cache
    + output * PRICE_PER_MILLION.output;
  return (rate * billed) / 1e6;
}

/** A zeroed token counter. */
function emptyTokens() {
  return {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    reasoningTokens: 0,
  };
}

/**
 * Read the durable usage event of one session and fold it into per-step rows.
 *
 * WorkBuddy bills two separate accounts, so the steps are folded twice: once
 * over the whole Session, and once per edition. The second pass is kept as
 * running checkpoints of a single chronological walk, so every edition's
 * answer to "where does this stand" is the one it had at the Session's latest
 * step — a turn that fell back from one account to the other leaves both sides
 * with an accurate, independent figure instead of a split that only the last
 * routing would explain.
 *
 * @param {any} session
 * @param {readonly any[]} models
 */
function foldSession(session, models) {
  const steps = [];
  const totals = emptyTokens();
  /** @type {Map<string, { steps: any[], totals: ReturnType<typeof emptyTokens>, page: object }>} */
  const pages = new Map();
  /** @type {Map<string, { tokens: number, steps: number, turn?: number, out?: number, page: () => any }>} */
  const checkpoint = new Map();
  let lastTurn;
  let inputTokens = 0;
  let outputTokens = 0;
  let cacheReadTokens = 0;
  let cacheWriteTokens = 0;
  let reasoningTokens = 0;
  let provider;
  let model;
  // The route the latest request went out on. Messages carry no provider of
  // their own, so the last request is what says which account pays for them.
  let lastRouteProvider;

  for (const event of session.snapshotEvents()) {
    if (event === null || typeof event !== 'object') continue;

    if (event.type === 'request/context') {
      if (typeof event.data?.provider === 'string') provider = event.data.provider;
      if (typeof event.data?.model === 'string') model = event.data.model;
      if (typeof event.data?.provider === 'string') lastRouteProvider = event.data.provider;
      continue;
    }
    if (event.type === 'request/header') {
      const config = event.data?.header?.config;
      if (typeof config?.provider === 'string') provider = config.provider;
      if (typeof config?.model === 'string') model = config.model;
      if (typeof config?.provider === 'string') lastRouteProvider = config.provider;
      continue;
    }
    if (event.type !== 'assistant/message') continue;

    const usage = event.data?.usage;
    if (usage === undefined || usage === null) continue;
    const stepInput = Number(usage.inputTokens) || 0;
    const stepOutput = Number(usage.outputTokens) || 0;
    const stepCacheRead = Number(usage.cacheReadTokens) || 0;
    const stepCacheWrite = Number(usage.cacheWriteTokens) || 0;
    const stepReasoning = Number(usage.reasoningTokens) || 0;

    totals.inputTokens += stepInput;
    totals.outputTokens += stepOutput;
    totals.cacheReadTokens += stepCacheRead;
    totals.cacheWriteTokens += stepCacheWrite;
    totals.reasoningTokens += stepReasoning;

    const stepModel = event.data?.message?.source?.model ?? model;
    const stepProvider = event.data?.message?.source?.provider ?? provider;
    // A message may name no provider of its own; it then belongs to the route
    // the request was sent on, and must be priced as that account's model.
    const routeProvider = stepProvider ?? lastRouteProvider;
    const rate = routeProvider === 'workbuddy' || routeProvider === 'workbuddy-ai'
      ? rateOf(models, routeProvider, stepModel)
      : undefined;

    const stepCredits = creditsForStep({ inputTokens: stepInput, outputTokens: stepOutput, cacheReadTokens: stepCacheRead, cacheWriteTokens: stepCacheWrite }, rate);
    const row = {
      seq: event.seq,
      time: event.time,
      // The message id is what the bridge's credit log is keyed by, so a step
      // can carry the cost the account was actually billed instead of a rate
      // estimate.
      id: event.data?.message?.id,
      turn: event.data?.turn,
      step: event.data?.step,
      provider: routeProvider,
      model: stepModel,
      inputTokens: stepInput,
      outputTokens: stepOutput,
      cacheReadTokens: stepCacheRead,
      cacheWriteTokens: stepCacheWrite,
      rate,
      credits: stepCredits,
    };
    steps.push(row);

    // Cumulative uncached volume, i.e. exactly what the model has been billed
    // for so far. Tokens already in the cache come back at cache-read price,
    // so the prompt of the latest call must not be added on top.
    inputTokens += stepInput;
    outputTokens += stepOutput;
    cacheReadTokens += stepCacheRead;
    cacheWriteTokens += stepCacheWrite;
    reasoningTokens += stepReasoning;
    lastTurn = event.data?.turn;

    const key = billingVariant(routeProvider);
    if (key === undefined) continue;
    let page = pages.get(key);
    if (page === undefined) {
      page = { steps: [], totals: emptyTokens(), page: {} };
      pages.set(key, page);
      checkpoint.set(key, {
        tokens: 0, steps: 0, page: () => ({
          billing: key,
          tokens: inputTokens + outputTokens,
          steps: checkpoint.get(key)?.steps ?? 0,
          turn: lastTurn,
          credits: 0,
        }),
      });
    }
    page.steps.push(row);
    page.totals.inputTokens += stepInput;
    page.totals.outputTokens += stepOutput;
    page.totals.cacheReadTokens += stepCacheRead;
    page.totals.cacheWriteTokens += stepCacheWrite;
    page.totals.reasoningTokens += stepReasoning;

    const priced = page.steps.reduce((sum, item) => sum + (item.credits ?? 0), 0);
    const counted = page.steps.filter((item) => item.credits !== undefined).length;
    const entry = checkpoint.get(key);
    entry.tokens = inputTokens + outputTokens;
    entry.steps = page.steps.length;
    entry.turn = lastTurn;
    entry.out = stepOutput;
    entry.page = () => {
      const recent = page.steps.slice(-MAX_STEPS);
      return {
        billing: key,
        provider: routeProvider,
        tokens: entry.tokens,
        steps: entry.steps,
        turn: entry.turn,
        out: entry.out,
        spend: { credits: priced, pricedSteps: counted, unpricedSteps: page.steps.length - counted },
        totals: { ...page.totals },
        steps: recent.map((item) => ({
          seq: item.seq,
          turn: item.turn,
          step: item.step,
          model: item.model,
          in: item.inputTokens,
          out: item.outputTokens,
          cache: item.cacheReadTokens,
          credits: item.credits,
        })),
      };
    };
  }

  const consumption = {
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheWriteTokens,
    reasoningTokens,
  };

  return { steps, totals, consumption, checkpoint, provider, model };
}

/**
 * Build the state document the pet renders.
 *
 * @param {object} input
 * @param {any} input.session
 * @param {any} input.agent
 * @param {string | undefined} input.providerHint
 * @param {any} input.tokenMeter
 * @param {(session: any) => any} [input.readPressure]
 * @param {WorkBuddyCache} input.cache
 * @param {() => Promise<unknown>} input.readWorkBuddy
 */
async function buildState({ session, agent, providerHint, tokenMeter, readPressure, cache, readWorkBuddy, readCredits }) {
  const wb = await readWorkBuddy().catch((error) => ({ error: String(error?.message ?? error) }));
  const models = Array.isArray(wb?.models) ? wb.models : [];

  // Messages carry no provider, so the account that paid for them is the one
  // the conversation's requests went out on. Read that route before folding,
  // and price against the catalog of that same account: the two editions list
  // different models at different rates.
  let route;
  if (session?.snapshotEvents !== undefined) {
    for (const event of session.snapshotEvents()) {
      if (event?.type === 'request/context' && typeof event.data?.provider === 'string') route = event.data.provider;
      if (event?.type === 'request/header' && typeof event.data?.header?.config?.provider === 'string') route = event.data.header.config.provider;
    }
  }
  route ??= providerHint ?? agent?.options?.config?.provider;
  const routeVariant = route === undefined ? undefined : billingVariant(route);
  let catalog = wb;
  if (routeVariant !== undefined && (cache.lastVariant !== routeVariant || !Array.isArray(wb?.models))) {
    catalog = await readWorkBuddy(routeVariant).catch((error) => ({ error: String(error?.message ?? error) }));
  }
  const priced = Array.isArray(catalog?.models) ? catalog.models : models;

  const folded = session === undefined
    ? { steps: [], totals: emptyTokens(), consumption: emptyTokens(), checkpoint: new Map(), provider: undefined, model: undefined }
    : foldSession(session, priced);

  // What the account was actually billed, per assistant message. The bridge
  // observes each upstream response's own credit figure and indexes it by the
  // message it paid for, so this replaces the rate estimate wherever it has an
  // answer. A message it has not seen stays unpriced rather than becoming 0.
  const billed = session?.id === undefined || readCredits === undefined
    ? {}
    : await readCredits(session.id).catch(() => ({}));
  if (billed !== null && typeof billed === 'object') {
    for (const row of folded.steps) {
      if (typeof row.id !== 'string') continue;
      const actual = billed[row.id];
      if (typeof actual !== 'number' || !Number.isFinite(actual)) continue;
      row.credits = actual;
      row.measured = true;
    }
  }
  const provider = folded.provider ?? providerHint ?? agent?.options?.config?.provider;
  const model = folded.model ?? agent?.options?.config?.model;

  let measurement;
  if (tokenMeter !== undefined && session !== undefined) {
    try {
      measurement = tokenMeter.measure(session);
    } catch {
      measurement = undefined;
    }
  }

  // Two different questions, two different numbers.
  //
  // `measurement.surfaceTokens` reprices every node still on the surface, and
  // it does not shrink when the context is compacted: a folded conversation
  // keeps reporting the sum of everything that was ever written, which is why
  // it can sit at 800k while the model only ever receives 68k.
  //
  // `contextPressure.projectedTokens` is the number the GUI ContextMeter draws:
  // the newest prompt sample plus the surface's signed movement since that
  // sample, so a compaction pulls it back down. It is the only figure that
  // answers "how full is this conversation right now" (see the `view` of
  // {@link contextPressureProjectionDefinition} in the token-meter package).
  //
  // Occupancy therefore reads the projection; the surface total is kept beside
  // it as `surfaceTokens` so a card can say which figure it is showing.
  const pressure = session === undefined || readPressure === undefined
    ? undefined
    : readPressure(session);
  const pressureTokens = typeof pressure?.pressureTokens === 'number' ? pressure.pressureTokens : undefined;
  const projectedTokens = typeof pressure?.projectedTokens === 'number' ? pressure.projectedTokens : undefined;
  const usedTokens = projectedTokens ?? pressureTokens ?? measurement?.surfaceTokens;

  const steps = folded.steps.slice(-MAX_STEPS);
  const lastStep = steps.length > 0 ? steps[steps.length - 1] : undefined;
  const spent = steps.reduce((sum, row) => sum + (row.credits ?? 0), 0);
  const counted = steps.filter((row) => row.credits !== undefined).length;
  const variant = billingVariant(provider);
  const credits = provider === 'workbuddy' || provider === 'workbuddy-ai' ? wb?.credits : undefined;

  return {
    at: Date.now(),
    session: {
      id: session?.id,
      // The opening line of the conversation, so a card can say which
      // conversation it is describing when the page does not.
      title: typeof session?.title === 'string' ? session.title : undefined,
      turn: steps.length > 0 ? steps[steps.length - 1].turn : undefined,
      step: steps.length > 0 ? steps[steps.length - 1].step : undefined,
    },
    route: { provider, model, billing: variant },
    // Which rate the steps were priced against. A model the account bills at
    // zero credits — a free preview, for instance — spends nothing per step,
    // and the card says so instead of showing a muted figure.
    priced: {
      billing: routeVariant,
      models: Array.isArray(priced) ? priced.length : 0,
      rate: lastStep?.rate,
      model: lastStep?.model,
    },
    // What the latest request actually carried, versus what the Session has
    // been billed for so far. The prompt of the latest call is already inside
    // the cached volume, so only the completion is added to the total.
    tokens: {
      totals: folded.totals,
      // Occupancy: what this conversation actually occupies in the window,
      // after any compaction. Same figure the GUI ContextMeter draws.
      usedTokens,
      usedSource: projectedTokens !== undefined ? 'projected' : pressureTokens !== undefined ? 'pressure' : 'surface',
      projectedTokens,
      pressureTokens,
      // The un-compacted sum of everything still on the surface. Reported for
      // reference only; it is NOT occupancy.
      surfaceTokens: measurement?.surfaceTokens,
      contextWindow: pressure?.contextWindow ?? session?.requestContext?.()?.contextWindow,
      last: steps.length > 0 ? steps[steps.length - 1] : undefined,
      usage: {
        turn: {
          inputTokens: usedTokens,
          outputTokens: lastStep?.outputTokens,
        },
        consumed: {
          inputTokens: folded.consumption.inputTokens,
          outputTokens: folded.consumption.outputTokens,
          cacheReadTokens: folded.consumption.cacheReadTokens,
        },
      },
    },
    steps: steps.map((row) => ({
      seq: row.seq,
      turn: row.turn,
      step: row.step,
      model: row.model,
      in: row.inputTokens,
      out: row.outputTokens,
      cache: row.cacheReadTokens,
      credits: row.credits,
      measured: row.measured === true,
    })),
    spend: {
      credits: spent,
      pricedSteps: counted,
      unpricedSteps: steps.length - counted,
      measuredSteps: steps.filter((row) => row.measured === true).length,
    },
    workbuddy: {
      status: wb?.status,
      domain: wb?.domain,
      credits,
      error: wb?.creditsError ?? (wb?.error !== undefined ? String(wb.error) : undefined),
      cached: wb?.cached === true,
    },
    cache: cache.size,
  };
}

export function apply(ctx) {
  const cache = new WorkBuddyCache();
  /** @type {Map<string, Promise<unknown>>} */
  const inflight = new Map();

  /**
   * Read the WorkBuddy status document: the sibling plugin's own route first,
   * because it already carries the decrypted desktop credential.
   *
   * Concurrent reads of one edition share a single request. The page polls
   * every two seconds while the cache lives for twenty, so without this the
   * first paint after a restart fires the same upstream status call twice.
   */
  const readWorkBuddy = async (variant) => {
    const hit = cache.get(variant);
    if (hit !== undefined) return { ...hit.value, cached: true };

    const pending = inflight.get(variant);
    if (pending !== undefined) return pending;

    const request = (async () => {
      try {
        const origin = services.origin?.();
        if (typeof origin !== 'string') return { error: 'no-web-server' };
        // The two WorkBuddy editions answer on sibling routes of one plugin;
        // the international build matches `ai`, everything else domestic `cn`.
        const path = variant === 'ai'
          ? '/plugins/dsh-workbuddy-bridge/ai/status'
          : '/plugins/dsh-workbuddy-bridge/status';
        const response = await fetch(`${origin}${path}`, {
          headers: {
            accept: 'application/json',
            // The route accepts same-origin reads; a loopback Origin keeps it
            // past its DNS-rebinding guard.
            origin,
          },
        });
        if (!response.ok) return { error: `status-${response.status}` };
        const document = await response.json();
        cache.lastVariant = variant;
        return cache.set(variant, document);
      } finally {
        inflight.delete(variant);
      }
    })();

    inflight.set(variant, request);
    return request;
  };

  /**
   * The credits the account was billed for one Session's messages, keyed by
   * message id.
   *
   * The bridge watches its own loopback stream and records each response's
   * credit figure, so this is the billed amount rather than a rate estimate.
   * It is deliberately not cached: the log grows as messages finish, and a
   * stale answer would under-report a conversation that is still running.
   */
  const readCredits = async (sessionId) => {
    const origin = services.origin?.();
    if (typeof origin !== 'string') return {};
    const response = await fetch(
      `${origin}/plugins/dsh-workbuddy-bridge/credit?sessionId=${encodeURIComponent(sessionId)}`,
      { headers: { accept: 'application/json', origin } },
    );
    if (!response.ok) return {};
    const document = await response.json();
    const credits = document?.credits;
    return credits !== null && typeof credits === 'object' ? credits : {};
  };

  /**
   * A route context authorised for every service the handler may read. Calling
   * `ctx.<service>` from a closure that only declared `webServer` throws
   * `cannot get property "<name>" without inject`, so the handler holds the
   * context Cordis actually granted for those services.
   */
  let services = { get: () => undefined, busiest: () => undefined, meter: undefined, origin: undefined };

  /**
   * The compaction-aware occupancy projection. Kept in its own slot so a host
   * without `sessionProjections` still serves the rest of the card instead of
   * failing the whole route: `readPressure` stays undefined and occupancy falls
   * back to the surface total.
   */
  let readPressure;

  ctx.inject(['sessionProjections'], (projCtx) => {
    readPressure = (session) => {
      try {
        const cached = projCtx.sessionProjections.cachedSnapshot(session, ['contextPressure']);
        const value = cached?.values?.contextPressure;
        // A cell that has not been caught up yet is a hint, not an answer; fold
        // the log only in that case so the common poll stays O(1).
        if (value?.projectedTokens !== undefined || value?.pressureTokens !== undefined) return value;
        return projCtx.sessionProjections.snapshot(session, ['contextPressure'])?.values?.contextPressure ?? value;
      } catch {
        return undefined;
      }
    };
    return () => {
      readPressure = undefined;
    };
  });

  ctx.inject(['webServer', 'agents', 'tokenMeter'], (webCtx) => {
    services = {
      get: (id) => webCtx.agents.get(/** @type {any} */ (id)),
      /**
       * Live Sessions ordered from idle to busiest. A web page need not name
       * its Session anywhere the Client can read, so this is the fallback that
       * lets the pet show the conversation actually on screen.
       */
      busiest: () => webCtx.agents
        .list()
        .filter((agent) => agent?.session !== undefined)
        .map((agent) => ({ agent, at: agent.session.seq }))
        .sort((a, b) => a.at - b.at)
        .map((item) => item.agent.session.id),
      meter: webCtx.tokenMeter,
      origin: () => webCtx.webServer.getOrigin(),
    };
    return () => {
      services = { get: () => undefined, busiest: () => undefined, meter: undefined, origin: undefined };
    };
  });

  ctx.inject(['webServer'], (webCtx) => {
    const disposers = [];
    disposers.push(webCtx.webServer.register({
      kind: 'exact',
      path: '/plugins/token-pet/state',
      /**
       * Both editions in one answer, each a closed ledger of its own.
       *
       * One request carries both so the two cards can never disagree about
       * which Session or which step they describe; they still never sum into
       * each other, because each edition counts only its own steps.
       */
      handler: async (req, res) => {
        const url = new URL(req.url ?? '/', 'http://127.0.0.1');
        try {
          const providerHint = url.searchParams.get('provider') ?? undefined;
          const requested = url.searchParams.get('session') ?? undefined;
          // The page does not always put its Session in the URL, so a request
          // without one falls back to the Session that moved last. Asking for
          // a Session by id must never quietly answer for a different one: a
          // card that says "conversation X" would then show Y's numbers.
          const resolved = requested === undefined ? services.busiest() : undefined;
          const sessionId = requested ?? resolved?.at(-1);
          const agent = sessionId === undefined ? undefined : services.get(sessionId);
          // A Session that is not live (archived, or not yet restored) may be
          // returned as a bare record with no event log; reporting this
          // Session's own state beats failing the whole request.
          const session = agent?.session === undefined ? undefined : agent.session;
          const readable = session !== undefined && typeof session.snapshotEvents === 'function' ? session : undefined;
          const billings = readable === undefined ? undefined : billingsOf(readable, providerHint, agent);
          const wanted = url.searchParams.get('billing') ?? billings?.primary ?? billingVariant(providerHint);

          const [primary, secondary] = await Promise.all([
            readWorkBuddy(wanted).catch((error) => ({ error: String(error?.message ?? error) })),
            readWorkBuddy(wanted === 'ai' ? 'cn' : 'ai').catch((error) => ({ error: String(error?.message ?? error) })),
          ]);

          const payload = await buildState({
            session: readable,
            agent,
            providerHint,
            tokenMeter: services.meter,
            readPressure,
            cache,
            readWorkBuddy: async () => primary,
            readCredits,
          });
          payload.billing = wanted;
          payload.editions = [
            { ...payload.workbuddy, billing: wanted },
            {
              billing: wanted === 'ai' ? 'cn' : 'ai',
              status: secondary?.status,
              domain: secondary?.domain,
              credits: secondary?.credits,
              error: secondary?.creditsError ?? (secondary?.error !== undefined ? String(secondary.error) : undefined),
              cached: secondary?.cached === true,
            },
          ];
          if (session === undefined) payload.candidates = resolved?.length ?? 0;
          // What the card should claim to be describing. `requested` was found
          // and is the Session in hand; `resolved` was chosen because the page
          // named none. The Client compares the id it sees on screen with
          // `payload.session.id` to notice a switch it was not told about.
          payload.source = requested === undefined ? (sessionId === undefined ? 'none' : 'fallback') : 'requested';
          // The id the page asked for, echoed back so the Client can tell
          // "the answer is about another conversation yet" from "no answer yet".
          payload.requested = requested ?? null;
          // A Session the Host knows but cannot read (not live any more) is
          // reported instead of a silent zero.
          if (readable === undefined && sessionId !== undefined) payload.unreadable = true;
          if (url.searchParams.get('debug') === '1') {
            payload.debug = {
              requested: requested ?? null,
              resolved: resolved ?? [],
              live: services.busiest() ?? [],
              billings,
              wanted,
            };
          }
          sendJson(res, payload);
        } catch (error) {
          sendJson(res, { error: String(error?.message ?? error) }, 500);
        }
      },
    }));
    // The pet's mascot artwork, served from the package so the Client half
    // never needs a blob URL or a second copy of the image.
    disposers.push(webCtx.webServer.register({
      kind: 'exact',
      path: '/plugins/token-pet/icon',
      handler: async (req, res) => {
        try {
          const bytes = await readFile(new URL('./icon.png', import.meta.url));
          res.writeHead(200, {
            'content-type': 'image/png',
            'cache-control': 'public, max-age=3600',
            'content-length': bytes.byteLength,
          });
          res.end(bytes);
        } catch (error) {
          res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
          res.end(String(error?.message ?? error));
        }
      },
    }));
    return () => {
      for (const dispose of disposers) dispose();
    };
  });
}
