// Token Radar's console dashboard. It reads window.RADAR (written beside dashboard/ by main.ts)
// and renders the ranked board, the filters, the per-protocol detail panel and the live-token
// view. No network: every byte it shows is in data.js. The farm plan shown in the detail panel is
// the board's own farm_steps, so the page and board.json always agree.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var state = { q: '', category: 'all', chain: 'all', minTvl: 0, wl: false, tab: 'pre-token', sort: 'implied', dir: -1, selected: null };

  var usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  function fmtMult(n) { return 'x' + n.toFixed(2); }
  // The model in one function, recomputed in the page from the snapshot figures: the detail panel
  // shows the same arithmetic board.json carries, so a reader can check any row by hand.
  function impliedOf(row) {
    var m = DATA.model;
    var growth = Math.min(m.growth_cap, Math.max(m.growth_floor, row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d));
    var growthMult = 1 + (growth / 100) * m.growth_weight;
    var age = row.age_days === null || row.age_days === undefined ? m.unknown_age_days : row.age_days;
    var maturity = m.maturity_floor + (Math.min(Math.max(age, 0), m.maturity_days) / m.maturity_days) * m.maturity_range;
    return Math.max(1, Math.round(row.tvl_usd * row.category_multiple * growthMult * maturity));
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('chain')) state.chain = params.get('chain');
    if (params.get('minTvl')) state.minTvl = Number(params.get('minTvl')) || 0;
    if (params.get('wl')) state.wl = params.get('wl') === '1';
    if (params.get('tab')) state.tab = params.get('tab');
    if (params.get('p')) state.selected = params.get('p');
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.minTvl) params.set('minTvl', String(state.minTvl));
    if (state.wl) params.set('wl', '1');
    if (state.tab !== 'pre-token') params.set('tab', state.tab);
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  function isWatchlist(r) { return r.on_watchlist === true; }

  function filteredRows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.wl && !isWatchlist(r)) return false;
      if (state.category !== 'all' && (r.category || 'Other') !== state.category) return false;
      if (state.chain !== 'all' && !(r.chains || []).includes(state.chain)) return false;
      if (state.minTvl && r.tvl_usd < state.minTvl) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function sortedRows(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else if (key === 'multiple') { av = a.category_multiple; bv = b.category_multiple; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }

  function renderStatic() {
    var top = DATA.rows[0];
    document.getElementById('mast-meta').innerHTML = '';
    var meta = document.getElementById('mast-meta');
    [['Snapshot', DATA.as_of], ['Model', DATA.model_version], ['Rows', String(DATA.board_size)]].forEach(function (pair) {
      var span = el('span', null, pair[0] + ' ', el('b', { text: pair[1] }));
      meta.appendChild(span);
    });
    document.getElementById('hero-title').textContent = DATA.watchlist_size + ' watchlist protocols, ranked by implied value';
    document.getElementById('hero-lede').textContent = 'The watchlist is the floor: every protocol with at least $' + Math.round(DATA.floor_usd / 1e6) + 'M of TVL and no token on record. The early radar adds ' + DATA.early_size + ' pre-token protocols below that floor, found by the same rule. Implied value is a model, not a promise: it says what a launch would be worth if the protocol\'s record stayed as it is.';
    var stats = document.getElementById('stats');
    stats.textContent = '';
    [['Watchlist covered', DATA.watchlist_size + ' / ' + DATA.watchlist_size],
     ['Pre-token rows scored', String(DATA.board_size)],
     ['Early rows below the floor', String(DATA.early_size)],
     ['Live-token protocols set aside', String(DATA.live_size)],
     ['Top implied value', top ? fmtUsd(top.implied_value_usd) : 'n/a']].forEach(function (pair) {
      stats.appendChild(el('div', null, el('dt', { text: pair[0] }), el('dd', { text: pair[1] })));
    });
    var signals = document.getElementById('signals');
    signals.textContent = '';
    DATA.rows.slice(0, 5).forEach(function (r) {
      signals.appendChild(el('button', { class: 'signal', type: 'button', onclick: function () { openDetail(r.slug); } },
        el('span', { class: 'rank', text: 'RANK ' + r.rank + (isWatchlist(r) ? ' · WATCHLIST' : '') }),
        el('span', { class: 'name', text: r.name }),
        el('span', { class: 'val', text: fmtUsd(r.implied_value_usd) }),
        el('span', { class: 'sub', text: 'TVL ' + fmtUsd(r.tvl_usd) + ' · ' + (r.category || 'Other') })
      ));
    });
    var expl = document.getElementById('explainer');
    var m = DATA.model;
    expl.textContent = '';
    expl.appendChild(el('h2', { text: 'How implied value is computed' }));
    expl.appendChild(el('p', { text: 'One function scores every row. The launch multiple comes from the market itself: for each category with at least ' + m.min_live_for_category + ' live-token protocols, the median market-cap-to-TVL ratio of those protocols; otherwise the global median across all live-token protocols (x' + DATA.global_multiple.toFixed(2) + ' here). Multiples are clamped to x' + m.multiple_floor + '–x' + m.multiple_cap + ', so no outlier category sets the price.' }));
    expl.appendChild(el('div', { class: 'formula', text: 'implied = round( tvl_usd x category_multiple x (1 + clamp(change_7d, ' + m.growth_floor + ', ' + m.growth_cap + ') / 100 x ' + m.growth_weight + ') x (' + m.maturity_floor + ' + min(age_days, ' + m.maturity_days + ') / ' + m.maturity_days + ' x ' + m.maturity_range + ') )' }));
    expl.appendChild(el('p', { text: 'Age is the time since the protocol was first listed — the best record of how long it has run with no token; an unlisted age uses ' + m.unknown_age_days + ' days. Protocols whose token already trades are set aside with their market caps shown, never mixed into the ranking. The snapshot records no token for the ranked protocols; that is a record, not proof that no token exists.' }));
    var foot = document.getElementById('foot');
    foot.textContent = '';
    foot.appendChild(el('p', null, el('b', { text: 'Read this before you farm: ' }), 'Implied value is this entry\'s own claim, never a price and never a promise that a token will be issued. “Records no token” means the snapshot carries no token for the protocol — not that it has none. Farming costs real gas and real capital; never pay anyone to claim an airdrop.'));
    foot.appendChild(el('p', { text: 'Source: ' + DATA.source + ' · Floor $' + DATA.floor_usd.toLocaleString('en-US') + ' · ' + DATA.board_size + ' rows, ' + DATA.watchlist_size + ' on the watchlist.' }));
  }

  function renderControls() {
    var box = document.getElementById('controls');
    box.textContent = '';
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var chains = Array.from(new Set(DATA.rows.reduce(function (acc, r) { return acc.concat(r.chains || []); }, []))).sort();
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Search name, category or chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); renderBoard(); });
    var catSel = el('select', { id: 'category', 'aria-label': 'Filter by category' },
      el('option', { value: 'all', text: 'All categories' }),
      categories.map(function (c) { return el('option', { value: c, text: c, selected: c === state.category ? 'selected' : null }); })
    );
    catSel.addEventListener('change', function () { state.category = catSel.value; writeHash(); renderBoard(); });
    var chainSel = el('select', { id: 'chain', 'aria-label': 'Filter by chain' },
      el('option', { value: 'all', text: 'All chains' }),
      chains.map(function (c) { return el('option', { value: c, text: c, selected: c === state.chain ? 'selected' : null }); })
    );
    chainSel.addEventListener('change', function () { state.chain = chainSel.value; writeHash(); renderBoard(); });
    var tvlSel = el('select', { id: 'minTvl', 'aria-label': 'Minimum TVL' },
      [[0, 'Any TVL'], [10000000, 'TVL $10M+'], [50000000, 'TVL $50M+'], [100000000, 'TVL $100M+'], [500000000, 'TVL $500M+']].map(function (pair) {
        return el('option', { value: String(pair[0]), text: pair[1], selected: state.minTvl === pair[0] ? 'selected' : null });
      })
    );
    tvlSel.addEventListener('change', function () { state.minTvl = Number(tvlSel.value) || 0; writeHash(); renderBoard(); });
    var wlBox = el('label', { class: 'check' },
      el('input', { type: 'checkbox', checked: state.wl ? 'checked' : null, onchange: function (e) { state.wl = e.target.checked; writeHash(); renderBoard(); } }),
      'Watchlist only'
    );
    var pre = el('button', { type: 'button', 'aria-pressed': state.tab === 'pre-token' ? 'true' : 'false', text: 'Pre-token', onclick: function () { state.tab = 'pre-token'; writeHash(); renderBoard(); } });
    var live = el('button', { type: 'button', 'aria-pressed': state.tab === 'live' ? 'true' : 'false', text: 'Live token', onclick: function () { state.tab = 'live'; writeHash(); renderBoard(); } });
    box.appendChild(el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search));
    box.appendChild(el('div', { class: 'field' }, el('label', { for: 'category', text: 'Category' }), catSel));
    box.appendChild(el('div', { class: 'field' }, el('label', { for: 'chain', text: 'Chain' }), chainSel));
    box.appendChild(el('div', { class: 'field' }, el('label', { for: 'minTvl', text: 'Min TVL' }), tvlSel));
    box.appendChild(wlBox);
    box.appendChild(el('div', { class: 'field' }, el('span', { class: 'sub', text: 'Token status' }), el('div', { class: 'tabs' }, pre, live)));
    box.appendChild(el('span', { class: 'count', id: 'count' }));
  }

  function sortHeader(key, label) {
    return el('th', { scope: 'col' },
      el('button', { type: 'button', onclick: function () { if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = -1; } renderBoard(); } },
        label,
        state.sort === key ? el('span', { 'aria-hidden': 'true', text: state.dir < 0 ? ' ▼' : ' ▲' }) : null
      )
    );
  }

  function boardTable() {
    var list = sortedRows(filteredRows());
    var count = document.getElementById('count');
    if (count) count.textContent = list.length + ' rows shown';
    if (list.length === 0) {
      return el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches that filter' }),
        el('p', { text: 'Clear the search or pick another category to see the board again.' }),
        el('button', { class: 'button primary', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; state.chain = 'all'; state.minTvl = 0; state.wl = false; writeHash(); renderBoard(); } })
      );
    }
    var max = DATA.rows[0].implied_value_usd || 1;
    var tbody = el('tbody');
    list.forEach(function (r) {
      var growth = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var tr = el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', { class: 'num', text: String(r.rank) }),
        el('td', null, el('div', { class: 'name' },
          el('b', { text: r.name }),
          el('span', { class: 'sub', text: (r.category || 'Other') + ' · ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') })
        )),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + growthClass, text: growth }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', { class: 'num', text: fmtMult(r.category_multiple) }),
        el('td', null, el('div', { class: 'implied' },
          el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((r.implied_value_usd / max) * 100)) + '%' })),
          el('span', { class: 'num', text: fmtUsd(r.implied_value_usd) })
        )),
        el('td', null, el('span', { class: 'pill' + (isWatchlist(r) ? ' hot' : ''), text: isWatchlist(r) ? 'watchlist · no token' : 'no token' }))
      );
      tbody.appendChild(tr);
    });
    return el('div', { class: 'table-wrap' },
      el('table', null,
        el('caption', { text: 'Pre-token protocols, strongest implied value first. Select a row for its model breakdown and farm plan.' }),
        el('thead', null, el('tr', null,
          sortHeader('implied', 'Rank'),
          sortHeader('name', 'Protocol'),
          sortHeader('tvl', 'TVL'),
          sortHeader('growth', '7d'),
          sortHeader('age', 'Age'),
          sortHeader('multiple', 'Multiple'),
          sortHeader('implied', 'Implied value'),
          el('th', { scope: 'col', text: 'Token' })
        )),
        tbody
      )
    );
  }

  function liveTable() {
    var count = document.getElementById('count');
    if (count) count.textContent = DATA.live.length + ' live-token protocols';
    var tbody = el('tbody');
    DATA.live.forEach(function (r) {
      tbody.appendChild(el('tr', null,
        el('td', { class: 'num', text: 'live' }),
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: (r.category || 'Other') + ' · ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', null, el('span', { class: 'pill', text: 'already trades' }))
      ));
    });
    return el('div', { class: 'table-wrap' },
      el('table', null,
        el('caption', { text: 'Token live: these protocols already trade, so their market cap is a fact, not a model. They are set aside from the pre-token ranking — and their market-cap-to-TVL ratios are what price the board.' }),
        el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Status' }), el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', text: 'TVL' }), el('th', { scope: 'col', text: '7d' }), el('th', { scope: 'col', text: 'Market cap' }), el('th', { scope: 'col', text: 'Token' }))),
        tbody
      )
    );
  }

  var detail = document.getElementById('detail');

  function openDetail(slug) {
    var row = DATA.rows.filter(function (r) { return r.slug === slug; })[0];
    if (!row) return;
    state.selected = slug;
    writeHash();
    detail.textContent = '';
    detail.hidden = false;
    var recomputed = impliedOf(row);
    var matches = recomputed === row.implied_value_usd;
    detail.appendChild(el('div', { class: 'detail-head' },
      el('div', null,
        el('span', { class: 'sub', text: 'Rank ' + row.rank + ' of ' + DATA.board_size + (isWatchlist(row) ? ' · on the watchlist' : ' · early radar') }),
        el('h2', { id: 'detail-title', text: row.name }),
        el('p', { class: 'sub', text: (row.category || 'Other') + ' on ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'an unnamed chain') + ' · first listed ' + (row.listed_at || 'date unknown') })
      ),
      el('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: closeDetail })
    ));
    detail.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Implied value — the model, line by line' }),
      el('div', { class: 'equation' },
        el('div', null, el('span', { text: 'TVL' }), el('b', { class: 'num', text: fmtUsd(row.tvl_usd) })),
        el('div', null, el('span', { text: 'Launch multiple (' + (row.multiple_source === 'category' ? 'category median' : 'global median') + ')' }), el('b', { class: 'num', text: fmtMult(row.category_multiple) })),
        el('div', null, el('span', { text: 'Seven-day growth' }), el('b', { class: 'num', text: fmtPct(row.change_7d) })),
        el('div', null, el('span', { text: 'Growth multiplier' }), el('b', { class: 'num', text: String(row.growth_multiplier) })),
        el('div', null, el('span', { text: 'Age with no token' }), el('b', { class: 'num', text: fmtAge(row.age_days) })),
        el('div', null, el('span', { text: 'Maturity multiplier' }), el('b', { class: 'num', text: String(row.maturity_multiplier) })),
        el('div', { class: 'total' }, el('span', { text: 'Implied value' }), el('b', { class: 'num', text: fmtUsd(row.implied_value_usd) }))
      ),
      el('p', { class: 'note', text: 'The page recomputes this row as ' + fmtUsd(recomputed) + (matches ? ', the same number board.json carries.' : ' — which differs from the board, so the data would be stale.') + ' This is an estimate from the snapshot\'s own figures, not a price and not a promise of a token.' })
    ));
    detail.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Farm plan — what to do' }),
      el('ol', { class: 'steps' }, (row.farm_steps || []).map(function (s) { return el('li', { text: s }); })),
      el('p', { class: 'note', text: 'This plan is the board\'s own farm_steps for ' + row.name + '. It records no token: the plan farms the protocol as it stands, and says nothing about whether or when a token is issued.' })
    ));
  }

  function closeDetail() {
    state.selected = null;
    detail.hidden = true;
    writeHash();
    renderBoard();
  }

  function renderBoard() {
    var panel = document.getElementById('board-panel');
    panel.textContent = '';
    panel.appendChild(state.tab === 'pre-token' ? boardTable() : liveTable());
    var app = document.getElementById('app');
    if (app) app.setAttribute('aria-busy', 'false');
    if (state.selected) openDetail(state.selected);
    else if (!detail.hidden) detail.hidden = true;
  }

  readHash();
  renderStatic();
  renderControls();
  renderBoard();
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !detail.hidden) closeDetail();
  });
})();
