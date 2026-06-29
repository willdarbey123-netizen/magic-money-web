/* ============================================================
   Magic Money - Main Application
   ============================================================ */

// ---- Palette for charts ----
const PALETTE = ['#E8B23A','#35C281','#5B9BFF','#E5689A','#8E7BFF','#49C7D8','#E8843A','#B0B6C2'];

// ---- State ----
const S = {
  rankings: null,
  prices: {},
  loading: false,
  error: null,
  tab: 'screener',
  route: 'screener',
  routeParam: null,
  search: '',
  sectorFilter: 'All',
  capFilter: 'All',
  addTxTicker: '',
  addTxType: 'BUY',
  planResult: null,
};

// ---- Storage ----
const Store = {
  _get(k, def) { try { return JSON.parse(localStorage.getItem(k) || 'null') ?? def; } catch { return def; } },
  _set(k, v)   { localStorage.setItem(k, JSON.stringify(v)); },

  watchlist()         { return this._get('mm_watchlist', []); },
  isWatched(t)        { return this.watchlist().some(w => w.ticker === t.toUpperCase()); },
  toggleWatch(t, n)   {
    const list = this.watchlist();
    const i = list.findIndex(w => w.ticker === t.toUpperCase());
    if (i >= 0) list.splice(i, 1); else list.push({ ticker: t.toUpperCase(), name: n || t });
    this._set('mm_watchlist', list);
  },

  transactions()      { return this._get('mm_transactions', []); },
  addTx(tx)           {
    const txs = this.transactions();
    txs.push(tx);
    this._set('mm_transactions', txs);
  },
  deleteTx(id)        { this._set('mm_transactions', this.transactions().filter(t => t.id !== id)); },

  holdings(txs) {
    const map = {};
    (txs || this.transactions()).forEach(tx => {
      const t = tx.ticker.toUpperCase();
      if (!map[t]) map[t] = { ticker: t, name: tx.name || t, shares: 0, costBasis: 0, realizedPL: 0, rankAtPurchase: null, firstBuyDate: null };
      if (tx.type === 'BUY') {
        if (!map[t].firstBuyDate || tx.date < map[t].firstBuyDate) map[t].firstBuyDate = tx.date;
        if (!map[t].rankAtPurchase && tx.rankAtPurchase) map[t].rankAtPurchase = tx.rankAtPurchase;
        map[t].costBasis += tx.shares * tx.price + (tx.fee || 0);
        map[t].shares    += tx.shares;
      } else {
        const avg = map[t].shares > 0 ? map[t].costBasis / map[t].shares : 0;
        map[t].realizedPL += tx.shares * tx.price - (tx.fee || 0) - tx.shares * avg;
        map[t].costBasis  -= tx.shares * avg;
        map[t].shares     -= tx.shares;
        if (map[t].shares < 0.0001) { map[t].shares = 0; map[t].costBasis = 0; }
      }
    });
    return Object.values(map).filter(h => h.shares > 0.0001);
  },
};

// ---- Data fetching ----
async function loadData() {
  if (!CONFIG || CONFIG.RANKINGS_URL.includes('YOUR_GITHUB')) {
    S.error = 'setup';
    render();
    return;
  }
  S.loading = true;
  S.error = null;
  render();
  try {
    const [rRes, pRes] = await Promise.all([fetch(CONFIG.RANKINGS_URL), fetch(CONFIG.PRICES_URL)]);
    if (!rRes.ok) throw new Error(`Rankings fetch failed: ${rRes.status}`);
    S.rankings = await rRes.json();
    if (pRes.ok) {
      const pd = await pRes.json();
      S.prices = {};
      Object.entries(pd.prices || {}).forEach(([k, v]) => { S.prices[k.toUpperCase()] = v; });
    }
  } catch (e) {
    S.error = e.message;
  }
  S.loading = false;
  render();
}

// ---- Formatters ----
const fmt = {
  money(v)    { if (v == null) return 'n/a'; return v >= 1e12 ? `$${(v/1e12).toFixed(2)}T` : v >= 1e9 ? `$${(v/1e9).toFixed(2)}B` : v >= 1e6 ? `$${(v/1e6).toFixed(2)}M` : v >= 1e3 ? `$${(v/1e3).toFixed(1)}K` : `$${v.toFixed(2)}`; },
  price(v)    { if (v == null) return 'n/a'; return `$${v.toFixed(2)}`; },
  pct(v)      { if (v == null) return 'n/a'; return `${(v * 100).toFixed(1)}%`; },
  pctSigned(v){ if (v == null) return 'n/a'; const s = v >= 0 ? '+' : ''; return `${s}${(v * 100).toFixed(1)}%`; },
  moneySigned(v){ if (v == null) return 'n/a'; return (v >= 0 ? '+' : '') + fmt.money(Math.abs(v)) * (v < 0 ? -1 : 1); },
  shares(v)   { return v % 1 === 0 ? v.toString() : v.toFixed(4).replace(/\.?0+$/, ''); },
  date(ms)    { return new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); },
  monthsAgo(ms) {
    const now = Date.now();
    const months = (now - ms) / (1000 * 60 * 60 * 24 * 30.44);
    return Math.floor(months);
  },
};

function plColor(v) { return v == null ? '' : v >= 0 ? 'color:var(--green)' : 'color:var(--red)'; }

// ---- SVG Charts ----
function svgRadar(axes, size) {
  if (!axes || axes.length < 3) return '';
  const n = axes.length;
  const cx = size / 2, cy = size / 2;
  const maxR = size * 0.33;
  const step = (2 * Math.PI) / n;
  const start = -Math.PI / 2;

  const pt = (i, f) => {
    const a = start + i * step;
    return [cx + maxR * f * Math.cos(a), cy + maxR * f * Math.sin(a)];
  };

  let svg = '';

  [0.25, 0.5, 0.75, 1.0].forEach(ring => {
    const pts = Array.from({ length: n }, (_, i) => pt(i, ring));
    const d = pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ') + 'Z';
    svg += `<path d="${d}" fill="none" stroke="#2a2d3a" stroke-width="1.5"/>`;
  });

  Array.from({ length: n }, (_, i) => {
    const [x, y] = pt(i, 1);
    svg += `<line x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="#2a2d3a" stroke-width="1.5"/>`;
  });

  const dataPts = axes.map((a, i) => pt(i, Math.max(0.02, a.value)));
  const dataD = dataPts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ') + 'Z';
  svg += `<path d="${dataD}" fill="rgba(232,178,58,0.25)" stroke="#E8B23A" stroke-width="2.5"/>`;

  dataPts.forEach(([x, y]) => {
    svg += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4" fill="#E8B23A"/>`;
  });

  axes.forEach((a, i) => {
    const [x, y] = pt(i, 1.38);
    svg += `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="middle" dominant-baseline="middle" fill="#7a7f94" font-size="11" font-family="system-ui">${a.label}</text>`;
  });

  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${svg}</svg>`;
}

function svgDonut(slices, size) {
  if (!slices || slices.length === 0) return '';
  const total = slices.reduce((s, sl) => s + sl.value, 0);
  if (total <= 0) return '';
  const cx = size / 2, cy = size / 2;
  const r = size * 0.44;
  const ir = r * 0.62;
  let startAngle = -Math.PI / 2;
  let paths = '';

  slices.forEach(sl => {
    if (sl.value <= 0) return;
    const sweep = (sl.value / total) * 2 * Math.PI;
    const endAngle = startAngle + sweep;
    const la = sweep > Math.PI ? 1 : 0;
    const x1 = cx + r  * Math.cos(startAngle), y1 = cy + r  * Math.sin(startAngle);
    const x2 = cx + r  * Math.cos(endAngle),   y2 = cy + r  * Math.sin(endAngle);
    const ix1 = cx + ir * Math.cos(endAngle),  iy1 = cy + ir * Math.sin(endAngle);
    const ix2 = cx + ir * Math.cos(startAngle),iy2 = cy + ir * Math.sin(startAngle);
    const d = `M${x1.toFixed(1)},${y1.toFixed(1)} A${r},${r} 0 ${la},1 ${x2.toFixed(1)},${y2.toFixed(1)} L${ix1.toFixed(1)},${iy1.toFixed(1)} A${ir},${ir} 0 ${la},0 ${ix2.toFixed(1)},${iy2.toFixed(1)} Z`;
    paths += `<path d="${d}" fill="${sl.color}"/>`;
    startAngle = endAngle;
  });

  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${paths}</svg>`;
}

function percentile(values, value) {
  if (!values || values.length === 0) return 0;
  return values.filter(v => v <= value).length / values.length;
}

// ---- Navigation ----
function go(route, param) {
  S.route = route;
  S.routeParam = param || null;
  if (['screener', 'watchlist', 'portfolio'].includes(route)) S.tab = route;
  render();
  document.getElementById('screen').scrollTop = 0;
}

// ---- Render ----
function render() {
  const screen = document.getElementById('screen');
  const nav = document.getElementById('nav');

  nav.querySelectorAll('button').forEach(b => {
    b.classList.toggle('active', b.dataset.tab === S.tab);
  });

  if (S.loading) { screen.innerHTML = loadingHTML(); return; }
  if (S.error === 'setup') { screen.innerHTML = setupHTML(); return; }
  if (S.error) { screen.innerHTML = errorHTML(S.error); return; }

  switch (S.route) {
    case 'screener':  screen.innerHTML = screenerHTML(); break;
    case 'detail':    screen.innerHTML = detailHTML(S.routeParam); break;
    case 'watchlist': screen.innerHTML = watchlistHTML(); break;
    case 'portfolio': screen.innerHTML = portfolioHTML(); break;
    case 'holding':   screen.innerHTML = holdingHTML(S.routeParam); break;
    case 'addtx':     screen.innerHTML = addTxHTML(S.routeParam); break;
    case 'rebalance': screen.innerHTML = rebalanceHTML(); break;
    case 'basket':    screen.innerHTML = basketHTML(); break;
    case 'guide':     screen.innerHTML = guideHTML(); break;
    default:          screen.innerHTML = screenerHTML();
  }
  bindEvents();
}

// ---- Loading / error ----
function loadingHTML() {
  return `<div class="loading"><div class="spinner"></div><span>Loading rankings...</span></div>`;
}

function errorHTML(msg) {
  return `<div class="loading">
    <div style="font-size:32px">!</div>
    <div style="font-weight:700">Could not load data</div>
    <div style="font-size:13px;color:var(--muted);text-align:center;max-width:280px">${msg}</div>
    <button class="btn-primary" style="width:160px;margin-top:8px" onclick="loadData()">Retry</button>
  </div>`;
}

function setupHTML() {
  return `<div class="loading">
    <div style="font-size:32px">M</div>
    <div style="font-weight:700;font-size:18px">Setup required</div>
    <div style="font-size:13px;color:var(--muted);text-align:center;max-width:300px;line-height:1.6">
      Edit <strong style="color:var(--text)">config.js</strong> with your public data URLs,
      then re-save and refresh. See the README for step-by-step instructions.
    </div>
  </div>`;
}

// ---- Screener ----
function screenerHTML() {
  if (!S.rankings) return `<div class="empty">No data loaded yet.<br><button class="btn-primary" style="width:160px;margin-top:16px" onclick="loadData()">Load now</button></div>`;
  const stocks = S.rankings.stocks || [];
  const sectors = ['All', ...new Set(stocks.map(s => s.sector || 'Unknown').filter(Boolean).sort())];
  const caps = ['All', 'Large', 'Mid', 'Small'];

  const filtered = stocks.filter(s => {
    if (S.search) {
      const q = S.search.toLowerCase();
      if (!s.ticker.toLowerCase().includes(q) && !(s.name || '').toLowerCase().includes(q)) return false;
    }
    if (S.sectorFilter !== 'All' && (s.sector || 'Unknown') !== S.sectorFilter) return false;
    if (S.capFilter !== 'All') {
      const cap = s.market_cap || s.marketCap || 0;
      if (S.capFilter === 'Large' && cap < 10e9) return false;
      if (S.capFilter === 'Mid'   && (cap < 2e9 || cap >= 10e9)) return false;
      if (S.capFilter === 'Small' && cap >= 2e9) return false;
    }
    return true;
  });

  const sectorChips = sectors.map(sec =>
    `<button class="chip ${S.sectorFilter === sec ? 'active' : ''}" data-action="sector" data-val="${sec}">${sec}</button>`
  ).join('');

  const capChips = caps.map(c =>
    `<button class="chip ${S.capFilter === c ? 'active' : ''}" data-action="cap" data-val="${c}">${c}</button>`
  ).join('');

  const rows = filtered.slice(0, 200).map(s => {
    const price = S.prices[s.ticker.toUpperCase()];
    const watched = Store.isWatched(s.ticker);
    const roc = s.roc != null ? `ROC ${fmt.pct(s.roc)}` : '';
    return `<div class="stock-row" data-action="detail" data-ticker="${s.ticker}">
      <div class="rank-badge">${s.magic_rank || s.magicRank}</div>
      <div class="stock-info">
        <div class="stock-ticker">${s.ticker}</div>
        <div class="stock-name">${s.name || ''}</div>
      </div>
      <div class="stock-meta">
        <div class="stock-price">${price != null ? fmt.price(price) : 'n/a'}</div>
        ${roc ? `<div class="roc-pill">${roc}</div>` : ''}
      </div>
      <button class="star-btn ${watched ? 'watched' : ''}" data-action="watch" data-ticker="${s.ticker}" data-name="${(s.name || '').replace(/"/g, '')}">${watched ? '&#9733;' : '&#9734;'}</button>
    </div>`;
  }).join('');

  return `
    <div class="screen-header"><div class="eyebrow">Magic Formula</div><h1>Screener</h1></div>
    <div class="filter-bar">
      <input class="search-box" id="search-input" placeholder="Search ticker or name..." value="${S.search}" data-action="search">
      <div class="chip-row">${sectorChips}</div>
      <div class="chip-row">${capChips}</div>
    </div>
    <div class="result-count">${filtered.length} stocks${filtered.length !== stocks.length ? ` of ${stocks.length}` : ''}</div>
    ${rows || '<div class="empty">No matches found.</div>'}
    <div style="height:16px"></div>
  `;
}

// ---- Detail ----
function detailHTML(ticker) {
  if (!ticker || !S.rankings) return `<div class="empty">Stock not found.</div>`;
  const stocks = S.rankings.stocks || [];
  const s = stocks.find(x => x.ticker.toUpperCase() === ticker.toUpperCase());
  if (!s) return `<div class="empty">Stock not found.</div>`;

  const price = S.prices[ticker.toUpperCase()];
  const watched = Store.isWatched(ticker);

  const allRoc = stocks.map(x => x.roc).filter(v => v != null);
  const allEy  = stocks.map(x => x.earnings_yield || x.earningsYield).filter(v => v != null);
  const allCap = stocks.map(x => x.market_cap || x.marketCap).filter(v => v != null);

  const ey = s.earnings_yield || s.earningsYield;
  const cap = s.market_cap || s.marketCap;
  const rank = s.magic_rank || s.magicRank;
  const rankRoc = s.rank_roc || s.rankRoc;
  const rankEy  = s.rank_ey  || s.rankEy;
  const combRank = s.combined_rank || s.combinedRank;
  const ebit = s.ebit;
  const ev   = s.enterprise_value || s.enterpriseValue;

  const axes = [
    { label: 'Quality', value: percentile(allRoc, s.roc) },
    { label: 'Value',   value: percentile(allEy,  ey) },
    { label: 'Size',    value: percentile(allCap, cap) },
  ];

  const sectorLine = [s.sector, s.industry].filter(Boolean).join(' / ') || 'Sector not available';

  return `
    <div class="back-header">
      <button class="back-btn" data-action="back">
        <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg>
      </button>
      <h2>${ticker}</h2>
    </div>
    <div class="detail-hero">
      <div class="detail-ticker">${s.ticker}</div>
      <div class="detail-name">${s.name || ''}</div>
      <div class="detail-price">${price != null ? fmt.price(price) : 'Price not available'}</div>
      <div class="detail-sector">${sectorLine}</div>
    </div>
    <div class="detail-actions">
      <button class="btn-outline ${watched ? 'gold' : ''}" data-action="watch" data-ticker="${s.ticker}" data-name="${(s.name || '').replace(/"/g, '')}">
        ${watched ? '&#9733; Watching' : '&#9734; Watch'}
      </button>
      <button class="btn-outline" data-action="addtx" data-ticker="${s.ticker}">+ Record buy</button>
    </div>

    <div class="section-title">Profile</div>
    <div style="font-size:13px;color:var(--muted);padding:4px 16px 8px;line-height:1.6">
      Where this stock sits versus the whole universe. Further out is better.
      Quality = return on capital percentile. Value = earnings yield percentile. Size = market cap percentile.
    </div>
    <div class="radar-wrap">${svgRadar(axes, 200)}</div>
    <div class="radar-legend">
      ${axes.map(a => `<div class="radar-legend-row"><span>${a.label}</span><span>${Math.round(a.value * 100)}th percentile</span></div>`).join('')}
    </div>

    <div class="section-title">Ranking</div>
    ${metricRow('Magic rank', rank)}
    ${metricRow('Combined rank', combRank)}
    ${metricRow('ROC rank', rankRoc)}
    ${metricRow('Earnings yield rank', rankEy)}

    <div class="section-title">Metrics</div>
    ${metricRow('Return on capital', s.roc != null ? fmt.pct(s.roc) : 'n/a')}
    ${metricRow('Earnings yield', ey != null ? fmt.pct(ey) : 'n/a')}
    ${metricRow('Price', price != null ? fmt.price(price) : 'n/a')}
    ${metricRow('Market cap', fmt.money(cap))}
    ${metricRow('EBIT', fmt.money(ebit))}
    ${metricRow('Enterprise value', fmt.money(ev))}
    ${s.fiscal_year || s.fiscalYear ? metricRow('Fiscal year', s.fiscal_year || s.fiscalYear) : ''}
    <div style="height:20px"></div>
  `;
}

function metricRow(label, val) {
  return `<div class="metric-row"><span class="metric-label">${label}</span><span class="metric-value">${val}</span></div>`;
}

// ---- Watchlist ----
function watchlistHTML() {
  const wl = Store.watchlist();
  const stocks = S.rankings?.stocks || [];

  const rows = wl.map(w => {
    const s = stocks.find(x => x.ticker.toUpperCase() === w.ticker.toUpperCase());
    const price = S.prices[w.ticker.toUpperCase()];
    const rank = s ? (s.magic_rank || s.magicRank) : null;
    return `<div class="stock-row" data-action="detail" data-ticker="${w.ticker}">
      <div class="rank-badge">${rank != null ? rank : '?'}</div>
      <div class="stock-info">
        <div class="stock-ticker">${w.ticker}</div>
        <div class="stock-name">${w.name || ''}</div>
      </div>
      <div class="stock-meta">
        <div class="stock-price">${price != null ? fmt.price(price) : 'n/a'}</div>
      </div>
      <button class="star-btn watched" data-action="watch" data-ticker="${w.ticker}" data-name="${(w.name || '').replace(/"/g, '')}">&#9733;</button>
    </div>`;
  }).join('');

  return `
    <div class="screen-header"><div class="eyebrow">Saved stocks</div><h1>Watchlist</h1></div>
    ${wl.length === 0
      ? '<div class="empty">Nothing here yet.<br>Tap the star next to any stock in the screener to add it.</div>'
      : rows
    }
  `;
}

// ---- Portfolio ----
function portfolioHTML() {
  const txs = Store.transactions();
  const holdings = Store.holdings(txs);
  const stocks = S.rankings?.stocks || [];

  const rows = holdings.map(h => {
    const price = S.prices[h.ticker];
    const mv = price != null ? price * h.shares : null;
    const upl = mv != null ? mv - h.costBasis : null;
    const uplPct = upl != null && h.costBasis > 0 ? upl / h.costBasis : null;
    return { ...h, price, mv, upl, uplPct };
  });

  const totalCost = rows.reduce((s, r) => s + r.costBasis, 0);
  const allPriced = rows.length > 0 && rows.every(r => r.price != null);
  const totalMv   = allPriced ? rows.reduce((s, r) => s + (r.mv || 0), 0) : null;
  const totalUpl  = totalMv != null ? totalMv - totalCost : null;
  const totalUplPct = totalUpl != null && totalCost > 0 ? totalUpl / totalCost : null;

  const sectorMap = {};
  stocks.forEach(s => { sectorMap[s.ticker.toUpperCase()] = s.sector || 'Unknown'; });

  const sectorTotals = {};
  rows.forEach(r => {
    const sec = sectorMap[r.ticker] || 'Unknown';
    const val = r.mv ?? r.costBasis;
    sectorTotals[sec] = (sectorTotals[sec] || 0) + val;
  });

  const alloc = Object.entries(sectorTotals)
    .sort((a, b) => b[1] - a[1])
    .map(([sector, value], i) => ({
      sector,
      value,
      fraction: totalCost > 0 ? value / (totalMv ?? totalCost) : 0,
      color: PALETTE[i % PALETTE.length],
    }));

  const topSector = alloc[0];
  const donutSlices = alloc.map(a => ({ value: a.value, color: a.color }));

  const holdingRows = rows.map(r => `
    <div class="holding-row" data-action="holding" data-ticker="${r.ticker}">
      <div class="holding-info">
        <div class="holding-ticker">${r.ticker}</div>
        <div class="holding-sub">${fmt.shares(r.shares)} shares &middot; avg ${fmt.price(r.costBasis / r.shares)}</div>
      </div>
      <div class="holding-right">
        <div class="holding-value">${r.mv != null ? fmt.price(r.mv) : 'n/a'}</div>
        <div class="holding-pl" style="${plColor(r.upl)}">
          ${r.upl != null ? `${r.upl >= 0 ? '+' : ''}${fmt.price(Math.abs(r.upl))} (${fmt.pctSigned(r.uplPct)})` : 'price n/a'}
        </div>
      </div>
    </div>
  `).join('');

  if (holdings.length === 0) {
    return `
      <div class="screen-header"><div class="eyebrow">Track your positions</div><h1>Portfolio</h1></div>
      <div class="empty">No holdings yet.<br>Tap the button below to record your first buy.</div>
      <div style="padding:16px"><button class="btn-primary" data-action="addtx">+ Record a transaction</button></div>
    `;
  }

  return `
    <div class="screen-header"><div class="eyebrow">Track your positions</div><h1>Portfolio</h1></div>

    <div class="card">
      <div class="card-title">TOTAL VALUE</div>
      <div class="summary-value">${totalMv != null ? fmt.price(totalMv) : 'Prices loading'}</div>
      <div class="stat-grid">
        <div class="stat-cell"><label>Cost basis</label><div class="val">${fmt.price(totalCost)}</div></div>
        <div class="stat-cell"><label>Unrealised P/L</label>
          <div class="val" style="${plColor(totalUpl)}">
            ${totalUpl != null ? `${totalUpl >= 0 ? '+' : ''}${fmt.price(Math.abs(totalUpl))}` : 'n/a'}
            ${totalUplPct != null ? ` (${fmt.pctSigned(totalUplPct)})` : ''}
          </div>
        </div>
      </div>
    </div>

    <div class="action-row">
      <button class="btn-outline" data-action="nav" data-route="rebalance">&#8635; Rebalance</button>
      <button class="btn-outline" data-action="nav" data-route="basket">&#9736; Plan basket</button>
    </div>
    <div style="padding:0 16px 8px"><button class="btn-primary" data-action="addtx">+ Record transaction</button></div>

    ${topSector && topSector.fraction > 0.4 ? `
      <div class="banner">Heads up: ${topSector.sector} is ${Math.round(topSector.fraction * 100)}% of your basket. The formula works best spread across many sectors.</div>
    ` : ''}

    ${alloc.length > 0 ? `
      <div class="card">
        <div class="card-title">SECTOR MIX</div>
        <div class="donut-wrap">
          <div class="donut-center" style="width:120px;height:120px;flex-shrink:0">
            ${svgDonut(donutSlices, 120)}
            <div class="donut-center-label">
              <div class="big">${holdings.length}</div>
              <div class="sm">${holdings.length === 1 ? 'holding' : 'holdings'}</div>
            </div>
          </div>
          <div class="donut-legend">
            ${alloc.map(a => `
              <div class="legend-row">
                <div class="legend-dot" style="background:${a.color}"></div>
                <div class="legend-name">${a.sector}</div>
                <div class="legend-pct">${Math.round(a.fraction * 100)}%</div>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    ` : ''}

    <div style="font-size:13px;font-weight:700;color:var(--gold);padding:12px 16px 6px">HOLDINGS</div>
    ${holdingRows}
    <div style="height:20px"></div>
  `;
}

// ---- Holding detail ----
function holdingHTML(ticker) {
  const txs = Store.transactions().filter(t => t.ticker.toUpperCase() === ticker.toUpperCase());
  const holdings = Store.holdings();
  const h = holdings.find(x => x.ticker === ticker.toUpperCase());
  const price = S.prices[ticker.toUpperCase()];
  const mv = h && price != null ? price * h.shares : null;
  const upl = mv != null && h ? mv - h.costBasis : null;

  const txRows = txs.map(tx => `
    <div class="tx-row">
      <div class="tx-type ${tx.type === 'BUY' ? 'tx-buy' : 'tx-sell'}">${tx.type}</div>
      <div class="tx-info">
        <div class="tx-date">${fmt.date(tx.date)}</div>
        <div class="tx-detail">${fmt.shares(tx.shares)} shares @ ${fmt.price(tx.price)}</div>
      </div>
      <button class="tx-del" data-action="deltx" data-id="${tx.id}">&#10005;</button>
    </div>
  `).join('');

  return `
    <div class="back-header">
      <button class="back-btn" data-action="back"><svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg></button>
      <h2>${ticker}</h2>
    </div>
    ${h ? `
      <div class="card">
        <div class="stat-grid">
          <div class="stat-cell"><label>Shares held</label><div class="val">${fmt.shares(h.shares)}</div></div>
          <div class="stat-cell"><label>Avg cost</label><div class="val">${fmt.price(h.costBasis / h.shares)}</div></div>
          <div class="stat-cell"><label>Market value</label><div class="val">${mv != null ? fmt.price(mv) : 'n/a'}</div></div>
          <div class="stat-cell"><label>Unrealised P/L</label><div class="val" style="${plColor(upl)}">${upl != null ? `${upl >= 0 ? '+' : ''}${fmt.price(Math.abs(upl))}` : 'n/a'}</div></div>
        </div>
      </div>
    ` : ''}
    <div style="padding:8px 16px"><button class="btn-primary" data-action="addtx" data-ticker="${ticker}">+ Add transaction</button></div>
    <div style="font-size:13px;font-weight:700;color:var(--gold);padding:12px 16px 6px">TRANSACTIONS</div>
    ${txRows || '<div class="empty" style="padding:24px">No transactions recorded.</div>'}
    <div style="height:20px"></div>
  `;
}

// ---- Add Transaction ----
function addTxHTML(ticker) {
  return `
    <div class="back-header">
      <button class="back-btn" data-action="back"><svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg></button>
      <h2>Record transaction</h2>
    </div>
    <div class="form-section">
      <div class="field-group" style="margin-top:16px">
        <div class="field">
          <label>Transaction type</label>
          <div class="type-toggle">
            <button data-action="txtype" data-val="BUY" class="${S.addTxType === 'BUY' ? 'active-buy' : ''}">BUY</button>
            <button data-action="txtype" data-val="SELL" class="${S.addTxType === 'SELL' ? 'active-sell' : ''}">SELL</button>
          </div>
        </div>
        <div class="field">
          <label>Ticker</label>
          <input id="tx-ticker" placeholder="e.g. AAPL" value="${ticker || S.addTxTicker}">
        </div>
        <div class="field-row">
          <div class="field">
            <label>Shares</label>
            <input id="tx-shares" type="number" step="0.0001" placeholder="e.g. 10">
          </div>
          <div class="field">
            <label>Price (USD)</label>
            <input id="tx-price" type="number" step="0.01" placeholder="e.g. 145.50">
          </div>
        </div>
        <div class="field">
          <label>Fee (optional, USD)</label>
          <input id="tx-fee" type="number" step="0.01" placeholder="0.00">
        </div>
      </div>
      <div id="tx-error" class="error-msg"></div>
      <button class="btn-primary" data-action="savetx">Save transaction</button>
    </div>
  `;
}

// ---- Rebalance ----
function rebalanceHTML() {
  const holdings = Store.holdings();
  const stocks = S.rankings?.stocks || [];
  const txs = Store.transactions();
  const now = Date.now();

  const rows = holdings.map(h => {
    const buys = txs.filter(t => t.ticker.toUpperCase() === h.ticker && t.type === 'BUY');
    const firstBuy = buys.length > 0 ? Math.min(...buys.map(t => t.date)) : null;
    const months = firstBuy ? fmt.monthsAgo(firstBuy) : null;
    const rankNow = stocks.find(s => s.ticker.toUpperCase() === h.ticker)?.magic_rank
                 || stocks.find(s => s.ticker.toUpperCase() === h.ticker)?.magicRank;
    const rankBought = h.rankAtPurchase;

    const signals = [];
    if (months != null) signals.push(`Held ${months} month${months === 1 ? '' : 's'}`);
    if (rankBought && rankNow) signals.push(`Rank ${rankBought} to ${rankNow}`);
    else if (rankNow) signals.push(`Now rank ${rankNow}`);
    if (!rankNow) signals.push('Not in current list');
    if (months >= 12) signals.push('Past the one-year mark');

    let action, actionColor;
    if (!rankNow)      { action = 'Consider selling'; actionColor = 'var(--red)'; }
    else if (months >= 12) { action = 'Due for review'; actionColor = 'var(--gold)'; }
    else if (rankNow > 50) { action = 'Rank slipping'; actionColor = 'var(--orange)'; }
    else               { action = 'Hold'; actionColor = 'var(--green)'; }

    const priority = !rankNow ? 0 : months >= 12 ? 1 : rankNow > 50 ? 2 : 3;
    return { ticker: h.ticker, signals, action, actionColor, priority, months: months ?? -1 };
  }).sort((a, b) => a.priority - b.priority || b.months - a.months);

  const rowsHTML = rows.map(r => `
    <div class="rebalance-row">
      <div class="rebalance-info">
        <div class="rebalance-ticker">${r.ticker}</div>
        <div class="rebalance-signals">${r.signals.join(' &middot; ')}</div>
      </div>
      <div class="action-tag" style="background:${r.actionColor}22;color:${r.actionColor};border:1px solid ${r.actionColor}44">${r.action}</div>
    </div>
  `).join('');

  return `
    <div class="back-header">
      <button class="back-btn" data-action="back"><svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg></button>
      <h2>Rebalance</h2>
    </div>
    <div class="screen-header" style="padding-top:12px">
      <div class="eyebrow">When to rotate</div>
      <h1>Hold a year, then replace</h1>
    </div>
    ${holdings.length === 0
      ? '<div class="empty">Record some buys in your portfolio first.</div>'
      : rowsHTML
    }
    <div style="height:20px"></div>
  `;
}

// ---- Basket Planner ----
function basketHTML() {
  const holdings = Store.holdings();
  const ownedTickers = new Set(holdings.map(h => h.ticker));
  const invested = holdings.reduce((s, h) => s + h.costBasis, 0);
  const stocks = S.rankings?.stocks || [];

  let resultHTML = '';
  if (S.planResult) {
    const p = S.planResult;
    if (p.targetReached) {
      resultHTML = `<div class="banner" style="margin-top:8px">You have reached your target of ${p.target} names. Time to rotate rather than add. Check the Rebalance screen.</div>`;
    } else if (p.capitalExhausted) {
      resultHTML = `<div class="banner" style="margin-top:8px">Capital fully deployed but you hold ${p.ownedCount} of ${p.target} names. Add capital or reduce the target.</div>`;
    } else {
      const nameRows = p.nextNames.map(s => `
        <div class="plan-line">
          <span>${s.ticker} <span style="color:var(--muted);font-size:12px">${s.name || ''}</span></span>
          <span>${fmt.price(p.perName)}</span>
        </div>
      `).join('');
      resultHTML = `
        <div class="plan-highlight">
          <div style="font-size:12px;color:var(--muted);text-transform:uppercase;letter-spacing:.06em">Put in this round</div>
          <div class="amount">${fmt.price(p.perRound)}</div>
          <div style="font-size:13px;color:var(--muted)">${fmt.price(p.perName)} each across ${p.namesThisRound} name${p.namesThisRound !== 1 ? 's' : ''}</div>
        </div>
        <div class="card">
          <div class="plan-line"><span>Building toward</span><span>${p.target} names</span></div>
          <div class="plan-line"><span>Cadence</span><span>${p.perBuy} names every ${p.monthsBetween} months</span></div>
          <div class="plan-line"><span>Total rounds</span><span>${p.totalRounds} (approx ${p.buildMonths} months)</span></div>
          <div class="plan-line"><span>Deployed so far</span><span>${fmt.price(p.investedSoFar)} across ${p.ownedCount} names</span></div>
          <div class="plan-line"><span>Left to deploy</span><span>${fmt.price(p.leftToDeploy)} over ${p.remainingRounds} rounds</span></div>
        </div>
        ${p.nextNames.length > 0 ? `
          <div class="card">
            <div class="card-title">THIS ROUND: TOP-RANKED NAMES YOU DON'T OWN</div>
            ${nameRows}
          </div>
        ` : ''}
      `;
    }
  }

  return `
    <div class="back-header">
      <button class="back-btn" data-action="back"><svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg></button>
      <h2>Basket planner</h2>
    </div>
    <div class="screen-header" style="padding-top:12px">
      <div class="eyebrow">Stage your entry</div>
      <h1>How much each buy</h1>
    </div>
    <div style="font-size:13px;color:var(--muted);padding:0 16px 12px;line-height:1.6">
      The formula stages money in over time. Tell it your total, target names, and pace, and it works out each buy. Already deployed is read from your holdings. This is a planning aid, not advice.
    </div>
    <div class="form-section">
      <div class="field-group">
        <div class="field"><label>Total capital for this strategy (USD)</label><input id="bp-capital" type="number" placeholder="e.g. 20000" value="${S._bpCapital || ''}"></div>
        <div class="field-row">
          <div class="field"><label>Target names</label><input id="bp-target" type="number" value="${S._bpTarget || '30'}"></div>
          <div class="field"><label>Per round</label><input id="bp-perbuy" type="number" value="${S._bpPerBuy || '6'}"></div>
          <div class="field"><label>Months apart</label><input id="bp-cadence" type="number" value="${S._bpCadence || '2'}"></div>
        </div>
      </div>
      <div id="bp-error" class="error-msg"></div>
      <button class="btn-primary" data-action="calcplan">Work out my next buy</button>
    </div>
    ${resultHTML}
    <div style="height:20px"></div>
  `;
}

// ---- Guide ----
function guideHTML() {
  return `
    <div class="back-header">
      <button class="back-btn" data-action="back"><svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg></button>
      <h2>How it works</h2>
    </div>
    <div class="guide-section">
      <h2>The idea</h2>
      <p>Buy good companies when they happen to be cheap. That is the entire philosophy. The method hunts for the overlap between solid businesses and reasonable prices, using two cold numbers and deliberately ignoring news, tips and forecasts.</p>

      <h2>Quality: is it a good business?</h2>
      <p>Measured as return on capital. For every $100 tied up in the things the business needs to operate, how many dollars of profit does it generate? Higher is better. Goodwill and excess cash are stripped out so you judge the underlying business, not its balance sheet structure.</p>

      <h2>Value: is it cheap right now?</h2>
      <p>Measured as earnings yield. For every $100 it would cost to buy the whole company (shares plus debt minus spare cash), how many dollars of operating profit do you get? Higher means cheaper. This is the real all-in price, not just the share price.</p>

      <h2>The ranking</h2>
      <p>Every company is ranked on quality and separately on cheapness, then those two rankings are added together. The lowest combined number wins. It rewards the best balance of good-and-cheap, not the single-best on either measure alone.</p>

      <h2>When to buy</h2>
      <p>A company near the top of the ranked list that you do not already own. Start from the top and work down. The ranking has already done the screening work. There is no chart pattern to wait for and no target price.</p>

      <h2>When to sell</h2>
      <p>After roughly one year, regardless of price. Sell and rotate into fresh top-ranked names you do not own. The exit is driven by time and by the rank decaying, never by a price target. Check the Rebalance screen for what is due.</p>

      <h2>How many names</h2>
      <p>About 20 to 30, each given a similar-sized slice of your pot. The equal-slice rule is the whole risk control. No single name should be able to sink the strategy.</p>

      <h2>Lump sum vs staging in</h2>
      <p>Staging in across about a year (the formula's own approach) reduces the pain of buying everything right before a dip. Putting it all in at once tends to do slightly better on average because markets drift up over time. Neither is wrong. The basket planner paces your capital if you choose to stage.</p>

      <h2>Important note</h2>
      <p>This app is a planning tool. Nothing in it is financial advice, and all investment decisions are yours. The Magic Formula has a strong long-run track record in equities, but individual years can lag the market and past performance is not a guarantee of future results.</p>
    </div>
    <div style="height:20px"></div>
  `;
}

// ---- Event binding ----
function bindEvents() {
  const screen = document.getElementById('screen');

  screen.addEventListener('click', e => {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const action = el.dataset.action;
    e.stopPropagation();

    if (action === 'back') {
      go(S.tab);
    } else if (action === 'detail') {
      go('detail', el.dataset.ticker);
    } else if (action === 'watch') {
      e.stopPropagation();
      Store.toggleWatch(el.dataset.ticker, el.dataset.name);
      render();
    } else if (action === 'sector') {
      S.sectorFilter = el.dataset.val;
      render();
    } else if (action === 'cap') {
      S.capFilter = el.dataset.val;
      render();
    } else if (action === 'nav') {
      go(el.dataset.route);
    } else if (action === 'addtx') {
      S.addTxTicker = el.dataset.ticker || '';
      go('addtx', el.dataset.ticker || null);
    } else if (action === 'holding') {
      go('holding', el.dataset.ticker);
    } else if (action === 'txtype') {
      S.addTxType = el.dataset.val;
      render();
    } else if (action === 'savetx') {
      saveTx();
    } else if (action === 'deltx') {
      if (confirm('Delete this transaction?')) {
        Store.deleteTx(el.dataset.id);
        render();
      }
    } else if (action === 'calcplan') {
      calcPlan();
    }
  }, true);

  const searchInput = document.getElementById('search-input');
  if (searchInput) {
    searchInput.addEventListener('input', e => {
      S.search = e.target.value;
      render();
    });
    searchInput.removeEventListener('click', e => e.stopPropagation());
  }
}

function saveTx() {
  const ticker = document.getElementById('tx-ticker')?.value.trim().toUpperCase();
  const sharesStr = document.getElementById('tx-shares')?.value.trim();
  const priceStr  = document.getElementById('tx-price')?.value.trim();
  const feeStr    = document.getElementById('tx-fee')?.value.trim();
  const errEl = document.getElementById('tx-error');

  const shares = parseFloat(sharesStr);
  const price  = parseFloat(priceStr);
  const fee    = parseFloat(feeStr) || 0;

  if (!ticker) { errEl.textContent = 'Enter a ticker.'; return; }
  if (!shares || shares <= 0) { errEl.textContent = 'Enter a valid number of shares.'; return; }
  if (!price  || price  <= 0) { errEl.textContent = 'Enter a valid price.'; return; }

  if (S.addTxType === 'SELL') {
    const held = Store.holdings().find(h => h.ticker === ticker)?.shares || 0;
    if (shares > held + 0.0001) { errEl.textContent = `You only hold ${fmt.shares(held)} shares.`; return; }
  }

  const stocks = S.rankings?.stocks || [];
  const stock = stocks.find(s => s.ticker.toUpperCase() === ticker);
  const rankNow = stock ? (stock.magic_rank || stock.magicRank) : null;

  Store.addTx({
    id: Math.random().toString(36).slice(2),
    ticker,
    name: stock?.name || ticker,
    type: S.addTxType,
    shares,
    price,
    fee,
    date: Date.now(),
    rankAtPurchase: S.addTxType === 'BUY' ? rankNow : null,
  });

  go('portfolio');
}

function calcPlan() {
  const capitalStr = document.getElementById('bp-capital')?.value;
  const targetStr  = document.getElementById('bp-target')?.value;
  const perBuyStr  = document.getElementById('bp-perbuy')?.value;
  const cadenceStr = document.getElementById('bp-cadence')?.value;
  const errEl = document.getElementById('bp-error');

  const capital = parseFloat(capitalStr);
  const target  = parseInt(targetStr);
  const perBuy  = parseInt(perBuyStr);
  const cadence = parseInt(cadenceStr);

  if (!capital || capital <= 0) { errEl.textContent = 'Enter a total capital amount.'; return; }
  if (!target  || target  <= 0) { errEl.textContent = 'Enter a target number of names.'; return; }
  if (!perBuy  || perBuy  <= 0) { errEl.textContent = 'Enter names per round.'; return; }
  if (!cadence || cadence <= 0) { errEl.textContent = 'Enter months between rounds.'; return; }

  errEl.textContent = '';
  S._bpCapital = capital;
  S._bpTarget  = target;
  S._bpPerBuy  = perBuy;
  S._bpCadence = cadence;

  const holdings = Store.holdings();
  const ownedTickers = new Set(holdings.map(h => h.ticker));
  const investedSoFar = holdings.reduce((s, h) => s + h.costBasis, 0);
  const ownedCount = holdings.length;
  const stocks = (S.rankings?.stocks || []).sort((a, b) => (a.magic_rank || a.magicRank) - (b.magic_rank || b.magicRank));

  const tgt = Math.max(1, target);
  const pb  = Math.max(1, perBuy);
  const totalRounds = Math.max(1, Math.ceil(tgt / pb));
  const buildMonths = (totalRounds - 1) * cadence;
  const remainingNames  = Math.max(0, tgt - ownedCount);
  const remainingRounds = Math.max(0, Math.ceil(remainingNames / pb));
  const leftToDeploy = Math.max(0, capital - investedSoFar);
  const perRound = remainingRounds > 0 ? leftToDeploy / remainingRounds : 0;
  const namesThisRound = Math.min(pb, remainingNames);
  const perName = namesThisRound > 0 ? perRound / namesThisRound : 0;
  const nextNames = stocks.filter(s => !ownedTickers.has(s.ticker.toUpperCase())).slice(0, namesThisRound);

  S.planResult = {
    perRound, perName, namesThisRound, totalRounds, remainingRounds,
    buildMonths, investedSoFar, leftToDeploy, ownedCount,
    target: tgt, perBuy: pb, monthsBetween: cadence, nextNames,
    targetReached: remainingNames === 0,
    capitalExhausted: leftToDeploy <= 0 && remainingNames > 0,
  };

  render();
}

// ---- Init ----
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('#nav button').forEach(btn => {
    btn.addEventListener('click', () => {
      S.planResult = null;
      go(btn.dataset.tab);
    });
  });

  loadData();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
});
