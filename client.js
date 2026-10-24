window.__ModuleLoader__.load({
  id: 'dsh-workbuddy-token-pet',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    // Where the shell keeps the Session of the conversation it is showing.
    const PAGE_SEAT = '[data-conversation-content]';
    const SESSION_ATTR = 'data-conversation-session';

    const COPY = {
      title: 'Token 桌宠',
      turn: '轮',
      step: '步',
      window: '上下文',
      cache: '缓存命中',
      sessionCredits: '积分消耗',
      stepCredits: '本步积分',
      consumed: '累计消耗',
      turnTokens: '本轮 Token',
      balance: '剩余积分',
      switchLabel: '切换版本',
      switchToCn: '只看 WB',
      switchToAi: '只看 WB AI',
      signedOut: '未登录',
      free: '免费',
      usageUnknown: '用量未知',
      unreadable: '读不到这个对话的用量',
      noSession: '没有打开的对话',
      compacted: '压缩前',
      surfaceNote: '已压缩，按压缩后计',
      occupied: '上下文占用',
      loading: '读取中…',
      failure: '读取失败',
      expand: '展开',
      collapse: '收起',
      cn: 'WB',
      ai: 'WB AI',
    };

    const CSS = `
.token-pet-root{position:fixed;right:18px;bottom:104px;z-index:60;display:flex;flex-direction:column;align-items:flex-end;gap:6px;font:12px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif;color:var(--dsw-alias-label-primary);user-select:none}
.token-pet-card{width:252px;background:var(--dsw-alias-bg-overlay);border:1px solid var(--dsw-alias-border-l1);border-radius:14px;box-shadow:0 10px 30px rgba(0,0,0,.18);overflow:hidden}
.token-pet-card.is-ai{border-top:2px solid var(--dsw-alias-brand-primary)}
.token-pet-card.is-cn{border-top:2px solid var(--dsw-alias-border-l2)}
.token-pet-head{display:flex;align-items:center;gap:8px;padding:8px 10px;background:var(--dsw-alias-bg-layer-1);cursor:pointer;border-bottom:1px solid var(--dsw-alias-border-l1)}
.token-pet-face{flex:0 0 auto;display:block;border-radius:50%}
.token-pet-title{font-weight:600;font-size:12.5px;flex:1 1 auto;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.token-pet-badge{font-size:10.5px;padding:1px 6px;border-radius:999px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);white-space:nowrap}
.token-pet-body{padding:8px 10px 10px}
.token-pet-row{display:flex;justify-content:space-between;gap:8px;padding:2px 0}
.token-pet-k{color:var(--dsw-alias-label-secondary);white-space:nowrap}
.token-pet-v{font-variant-numeric:tabular-nums;text-align:right;word-break:break-all}
.token-pet-bar{position:relative;height:6px;border-radius:999px;background:var(--dsw-alias-bg-layer-2);overflow:hidden;margin:6px 0 2px}
.token-pet-fill{position:absolute;left:0;top:0;bottom:0;border-radius:999px;background:var(--dsw-alias-brand-primary);transition:width .3s ease}
.token-pet-fill.is-idle{background:var(--dsw-alias-state-idle-primary)}
.token-pet-sep{height:1px;background:var(--dsw-alias-border-l1);margin:7px 0}
.token-pet-steps{display:flex;align-items:flex-end;gap:2px;height:26px;margin-top:6px}
.token-pet-step{flex:1 1 auto;min-width:2px;border-radius:1px 1px 0 0;background:var(--dsw-alias-brand-primary);opacity:.45}
.token-pet-step.is-last{opacity:1}
.token-pet-card.is-cn .token-pet-step{background:var(--dsw-alias-label-secondary)}
.token-pet-card.is-cn .token-pet-fill{background:var(--dsw-alias-label-secondary)}
.token-pet-hint{color:var(--dsw-alias-label-secondary);font-size:10.5px;margin-top:6px}
.token-pet-err{color:var(--dsw-alias-state-error-primary);font-size:11px;margin-top:6px;word-break:break-all}
.token-pet-mini{display:flex;align-items:center;gap:7px;padding:5px 10px 5px 5px;background:var(--dsw-alias-bg-overlay);border:1px solid var(--dsw-alias-border-l1);border-radius:999px;box-shadow:0 6px 18px rgba(0,0,0,.16);cursor:pointer}
.token-pet-mini .token-pet-v{font-weight:600}
.token-pet-switch{display:inline-flex;flex:0 0 auto;gap:2px;padding:2px;border-radius:999px;background:var(--dsw-alias-bg-layer-2)}
.token-pet-switch-chip{font-size:10.5px;line-height:1.3;padding:1px 7px;border-radius:999px;color:var(--dsw-alias-label-secondary);cursor:pointer;white-space:nowrap}
.token-pet-switch-chip:hover{color:var(--dsw-alias-label-primary)}
.token-pet-switch-chip.is-on{background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-weight:600}
.token-pet-switch-chip:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}
`;

    function fmt(n) {
      if (typeof n !== 'number' || !Number.isFinite(n)) return '—';
      if (Math.abs(n) >= 1_000_000_000) return (n / 1_000_000_000).toFixed(2) + 'B';
      if (Math.abs(n) >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M';
      if (Math.abs(n) >= 1_000) return (n / 1_000).toFixed(1) + 'k';
      return String(Math.round(n));
    }

    function fmtCredits(n) {
      if (typeof n !== 'number' || !Number.isFinite(n)) return '—';
      if (n === 0) return '0';
      return n >= 100 ? Math.round(n).toString() : n.toFixed(1);
    }

    function num(value) {
      return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
    }

    function face(size) {
      return h('img', {
        className: 'token-pet-face',
        src: '/plugins/token-pet/icon',
        alt: '',
        width: size,
        height: size,
        style: { width: size + 'px', height: size + 'px' },
      });
    }

    function Row(props) {
      return h('div', { className: 'token-pet-row' },
        h('span', { className: 'token-pet-k' }, props.k),
        h('span', { className: 'token-pet-v' }, props.v));
    }

    /**
     * The conversation the page has open.
     *
     * The shell writes it on the conversation area it renders, which is the
     * one statement in the page that follows a switch. The card reads that
     * attribute on every tick instead of guessing from the address bar, from
     * page objects, or from whichever conversation the Host saw last.
     *
     * @returns {string | undefined}
     */
    function openSessionId() {
      try {
        const seat = document.querySelector(PAGE_SEAT);
        const id = seat === null ? null : seat.getAttribute(SESSION_ATTR);
        return typeof id === 'string' && id.length > 0 ? id : undefined;
      } catch {
        return undefined;
      }
    }

    /**
     * The usage one edition is billed for.
     *
     * The Host reports a running ledger per edition: how much the Session has
     * been billed for so far, and what the latest request carried. The former
     * is the figure the remaining balance is spent by; the latter is only this
     * one call, so it never stands in for the total.
     */
    function editionUsage(source) {
      const tokens = (source && source.tokens) || {};
      const usage = tokens.usage || {};
      const consumed = usage.consumed || {};
      const spend = (source && source.spend) || {};
      const steps = (source && source.steps) || [];
      const last = steps.length > 0 ? steps[steps.length - 1] : undefined;
      const turnCredits = last && typeof last.credits === 'number' ? last.credits : undefined;
      const stepTotal = steps.reduce((sum, row) => sum + (num(row.credits) || 0), 0);
      // The Session's own total, unless the Host only reports the account's
      // ledger: the steps this page shows are then the figure that matches.
      const sessionCredits = num(spend.credits) !== undefined ? num(spend.credits) : (steps.length > 0 ? stepTotal : undefined);
      const consumedTokens = num(consumed.inputTokens) !== undefined || num(consumed.outputTokens) !== undefined
        ? (num(consumed.inputTokens) || 0) + (num(consumed.outputTokens) || 0)
        : undefined;
      return {
        // Occupancy, post-compaction: the Host resolves this to the same
        // `projectedTokens` the ContextMeter draws. `surfaceTokens` is the
        // un-compacted surface sum and must not be used as occupancy.
        // A Host still running the previous build reports only `surfaceTokens`;
        // fall back to it so the card keeps a figure instead of a dash until
        // the next restart. `usedSource === 'surface'` makes the card say so.
        used: num(tokens.usedTokens) ?? num(tokens.surfaceTokens),
        usedSource: typeof tokens.usedSource === 'string'
          ? tokens.usedSource
          : (num(tokens.usedTokens) === undefined && num(tokens.surfaceTokens) !== undefined ? 'surface' : undefined),
        surfaceTokens: num(tokens.surfaceTokens),
        win: num(tokens.contextWindow),
        cacheRead: num(consumed.cacheReadTokens),
        turnIn: num((usage.turn || {}).inputTokens),
        turnOut: num((usage.turn || {}).outputTokens),
        consumedTokens,
        turnCredits,
        sessionCredits,
        // A model the account bills at zero credits spends nothing per step;
        // the card says "免费" rather than a muted zero. A step the bridge
        // actually billed outranks the catalog's rate.
        free: source && source.priced && source.priced.rate === 0 && !(sessionCredits > 0),
        steps,
        last,
        turnNo: source && source.session && num(source.session.turn),
        connected: num(consumedTokens) !== undefined && (source.steps || []).some((row) => row.credits !== undefined),
      };
    }

    function TokenPet() {
      const [openId, setOpenId] = React.useState(undefined);
      const [state, setState] = React.useState(null);
      const [failure, setFailure] = React.useState(null);
      // One card holds both editions; the switch only decides which page it
      // shows, so the two figures are never read side by side as one total.
      const [page, setPage] = React.useState(null);
      const [open, setOpen] = React.useState(true);
      const askedRef = React.useRef(undefined);

      // Follow the conversation the page is on. The attribute is written by
      // the shell itself, so a switch shows up here within a tick.
      React.useEffect(() => {
        const tick = () => setOpenId(openSessionId());
        tick();
        const timer = setInterval(tick, 700);
        return () => clearInterval(timer);
      }, []);

      React.useEffect(() => {
        // Switched conversation: drop the old figures at once so the card
        // never shows the previous conversation's numbers under a new title.
        if (askedRef.current !== undefined && askedRef.current !== openId) setState(null);
        askedRef.current = openId;
      }, [openId]);

      React.useEffect(() => {
        let alive = true;
        async function pull() {
          try {
            const qs = openId === undefined ? '' : '?' + new URLSearchParams({ session: openId }).toString();
            const response = await fetch('/plugins/token-pet/state' + qs, {
              headers: { accept: 'application/json' },
            });
            if (!response.ok) throw new Error('HTTP ' + response.status);
            const body = await response.json();
            if (!alive) return;
            setState(body);
            setFailure(body && body.error ? String(body.error) : null);
          } catch (cause) {
            if (alive) setFailure(String((cause && cause.message) || cause));
          }
        }
        pull();
        const timer = setInterval(pull, 2000);
        return () => {
          alive = false;
          clearInterval(timer);
        };
      }, [openId]);

      const route = (state && state.route) || {};
      const wb = (state && state.workbuddy) || {};
      const alive = state !== null;
      const editions = (state && state.editions) || [];
      const primary = (state && state.billing) || route.billing;

      /**
       * One edition's page: its own balance, its own spend, its own steps.
       * The Host answers for both at once, so a card renders whichever has
       * something to say and shows the other as idle rather than merged.
       */
      function pageOf(billing) {
        const role = primary === billing;
        const mine = route.billing === billing;
        const balances = role ? wb : (editions.find((item) => item && item.billing === billing) || {});
        const credits = balances.credits;
        const total = credits && num(credits.total);
        const usage = editionUsage(mine ? state : undefined);
        return {
          billing,
          label: billing === 'ai' ? COPY.ai : COPY.cn,
          signedOut: balances.status === 'signed-out',
          status: balances.status,
          total,
          unlimited: credits && credits.unlimited === true,
          balanceError: balances.error,
          mine,
          usage,
        };
      }

      const pages = [pageOf('cn'), pageOf('ai')];
      // The edition the running model is billed against is the page shown
      // first, so what opens is the account actually being spent.
      const shown = pages[page === 'ai' || page === 'cn' ? (page === 'ai' ? 1 : 0) : (primary === 'ai' ? 1 : 0)];

      const balanceText = (target) => {
        if (target.unlimited) return '不限';
        if (target.total !== undefined) return Math.round(target.total) + '';
        if (target.signedOut) return COPY.signedOut;
        return '—';
      };

      // The switch sits beside the title and swaps the page in place; it must
      // not reach the header, whose click folds the card away.
      const switchButton = (target) => h('span', {
        key: target.billing,
        className: 'token-pet-switch-chip' + (target.billing === shown.billing ? ' is-on' : ''),
        role: 'button',
        tabIndex: 0,
        title: target.billing === 'ai' ? COPY.switchToAi : COPY.switchToCn,
        onClick: (event) => {
          event.stopPropagation();
          setPage(target.billing);
        },
        onKeyDown: (event) => {
          if (event.key !== 'Enter' && event.key !== ' ') return;
          event.stopPropagation();
          setPage(target.billing);
        },
      }, target.label);

      const switcher = h('span', {
        className: 'token-pet-switch',
        role: 'group',
        'aria-label': COPY.switchLabel,
      }, pages.map(switchButton));

      const usage = shown.usage;
      const pct = usage.used !== undefined && usage.win !== undefined && usage.win > 0
        ? Math.min(100, (usage.used / usage.win) * 100)
        : 0;
      const accent = shown.billing === 'ai' ? ' is-ai' : ' is-cn';
      // True when the context has been compacted: occupancy is then far below
      // the un-compacted surface total, and the card says which one it shows.
      const compacted = usage.surfaceTokens !== undefined && usage.used !== undefined
        && usage.surfaceTokens > usage.used * 1.1;

      if (!open) {
        return h('div', { className: 'token-pet-root' },
          h('div', {
            className: 'token-pet-mini' + accent,
            role: 'button',
            tabIndex: 0,
            title: COPY.expand,
            onClick: () => setOpen(true),
            onKeyDown: (event) => {
              if (event.key === 'Enter' || event.key === ' ') setOpen(true);
            },
          },
            face(20),
            switcher,
            // The folded card shows what this conversation has spent, not how
            // many tokens it moved: the balance beside it is already a
            // credit figure, so the pair reads on one scale.
            h('span', { className: 'token-pet-v' }, fmtCredits(usage.sessionCredits)),
            h('span', { className: 'token-pet-badge' }, balanceText(shown))));
      }

      const recent = usage.steps.slice(-24);
      const maxCredits = recent.reduce((m, row) => Math.max(m, num(row.credits) || 0), 0);

      return h('div', { className: 'token-pet-root' },
        h('div', { className: 'token-pet-card' + accent },
          h('div', {
            className: 'token-pet-head',
            role: 'button',
            tabIndex: 0,
            title: COPY.collapse,
            onClick: () => setOpen(false),
            onKeyDown: (event) => {
              if (event.key === 'Enter' || event.key === ' ') setOpen(false);
            },
          },
            face(24),
            h('span', { className: 'token-pet-title' }, shown.label),
            usage.turnNo !== undefined ? h('span', { className: 'token-pet-badge' }, COPY.turn + ' ' + usage.turnNo) : null,
            switcher),
          h('div', { className: 'token-pet-body' },
            h(Row, { k: COPY.occupied, v: usage.used !== undefined ? fmt(usage.used) + ' / ' + fmt(usage.win) : '—' }),
            h('div', { className: 'token-pet-bar' },
              h('div', { className: 'token-pet-fill' + (shown.mine ? '' : ' is-idle'), style: { width: pct + '%' } })),
            // Occupancy is read after compaction, so say so when the two figures
            // disagree — otherwise the surface total looks like a lost number.
            compacted && usage.surfaceTokens !== undefined
              ? h('div', { className: 'token-pet-hint' }, COPY.surfaceNote + ' · ' + COPY.compacted + ' ' + fmt(usage.surfaceTokens))
              : null,
            h('div', { className: 'token-pet-sep' }),
            h(Row, { k: COPY.turnTokens, v: fmt(usage.turnIn) + ' / ' + fmt(usage.turnOut) }),
            h(Row, { k: COPY.consumed, v: fmt(usage.consumedTokens) }),
            h(Row, { k: COPY.cache, v: fmt(usage.cacheRead) }),
            h('div', { className: 'token-pet-sep' }),
            h(Row, { k: COPY.sessionCredits, v: usage.sessionCredits !== undefined ? fmtCredits(usage.sessionCredits) + (usage.free ? ' · ' + COPY.free : '') : '—' }),
            h(Row, { k: COPY.stepCredits, v: usage.free ? COPY.free + ' 0' : fmtCredits(usage.turnCredits) }),
            recent.length > 0
              ? h('div', { className: 'token-pet-steps' },
                  recent.map((row, index) => h('div', {
                    key: row.seq !== undefined ? String(row.seq) : String(index),
                    className: 'token-pet-step' + (index === recent.length - 1 ? ' is-last' : ''),
                    title: COPY.step + ' ' + row.step + ' · ' + fmtCredits(row.credits),
                    style: {
                      height: maxCredits > 0 ? Math.max(2, Math.round(((num(row.credits) || 0) / maxCredits) * 24)) + 'px' : '2px',
                    },
                  })))
              : null,
            h('div', { className: 'token-pet-sep' }),
            h(Row, { k: COPY.balance, v: balanceText(shown) }),
            // An edition that has not run yet keeps its page but says so
            // instead of reporting the other one's figures.
            usage.connected ? null : h('div', { className: 'token-pet-hint' }, COPY.usageUnknown),
            // A conversation the Host knows but cannot read (it is not live
            // any more) says so instead of showing zeros.
            alive && state.unreadable ? h('div', { className: 'token-pet-hint' }, COPY.unreadable) : null,
            shown.balanceError ? h('div', { className: 'token-pet-hint' }, String(shown.balanceError)) : null)),
        !alive ? h('div', { className: 'token-pet-hint' }, openId === undefined ? COPY.noSession : COPY.loading) : null,
        failure ? h('div', { className: 'token-pet-err' }, failure) : null);
    }

    /** Styles travel with the slot entry, so collapsing it removes them. */
    function Style() {
      return h('style', { id: 'token-pet-styles' }, CSS);
    }

    /**
     * Keep one bad render from taking the pet off the page for good.
     *
     * The Host drops an occupant that throws, and the slot then reports it as
     * `active: false` — so a data shape this card did not expect reads as
     * "the pet is gone" until the next reload. Catching the throw keeps the
     * entry mounted and shows why instead.
     */
    class Guard extends React.Component {
      constructor(props) {
        super(props);
        this.state = { error: null };
      }

      static getDerivedStateFromError(cause) {
        return { error: String((cause && cause.message) || cause) };
      }

      render() {
        if (this.state.error === null) return this.props.children;
        return h('div', { className: 'token-pet-root' },
          h('div', { className: 'token-pet-card' },
            h('div', { className: 'token-pet-body' },
              h('div', { className: 'token-pet-err' }, COPY.failure + ': ' + this.state.error))));
      }
    }

    function GuardedPet() {
      return h(Guard, null, h(TokenPet));
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        ctx.slots.inject('shell.overlay', () => [
          ctx.slots.register({ name: 'shell.overlay', id: 'token-pet-styles', order: 900 }, Style),
          ctx.slots.register({ name: 'shell.overlay', id: 'token-pet', order: 901 }, GuardedPet),
        ]);
      },
    };
  },
});
