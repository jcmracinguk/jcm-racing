(() => {
  const tile = document.getElementById('jcm-watch-summary');
  if (!tile) return;

  const currency = new Intl.NumberFormat('en-GB', {
    style: 'currency', currency: 'GBP', signDisplay: 'exceptZero'
  });
  const money = cents => currency.format(cents / 100);
  const labels = { WIN: 'Horse lost', LOSS: 'Horse won', NR: 'Void', PENDING: 'Pending' };
  const dialog = document.createElement('dialog');
  dialog.className = 'jcm-watch-dialog';
  dialog.setAttribute('aria-labelledby', 'jcm-watch-title');
  dialog.innerHTML = '<form method="dialog"><button aria-label="Close Watch List">Close</button></form>' +
    '<h2 id="jcm-watch-title">Watch List</h2><p id="jcm-watch-totals" role="status"></p>' +
    '<label>Race date <select id="jcm-watch-date"></select></label><div id="jcm-watch-rows"></div>';
  document.body.append(dialog);

  const date = dialog.querySelector('select');
  const totals = dialog.querySelector('#jcm-watch-totals');
  const list = dialog.querySelector('#jcm-watch-rows');
  let ledger;
  let request;

  function netCents(row) {
    if (row.result_status === 'NR') return 0;
    if (!Number.isFinite(row.lay_odds) || row.lay_odds <= 1) return null;
    if (row.result_status === 'LOSS') return -ledger.liability_gbp * 100;
    if (row.result_status !== 'WIN') return 0;
    return Math.round(ledger.liability_gbp * (1 - ledger.commission_rate) * 100 / (row.lay_odds - 1));
  }

  function appendText(parent, tag, text, className) {
    const node = document.createElement(tag);
    node.textContent = text;
    if (className) node.className = className;
    parent.append(node);
    return node;
  }

  function addLink(parent, raw, label) {
    if (!raw) return;
    const url = new URL(raw);
    if (url.protocol !== 'https:' || !['www.sportinglife.com', 'api.theracingapi.com'].includes(url.hostname)) return;
    const link = appendText(parent, 'a', label, 'watch-source');
    link.href = url.href;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
  }

  function paintRows() {
    const rows = ledger.entries.filter(row => row.race_date === date.value);
    list.replaceChildren();
    const daily = rows.reduce((sum, row) => sum + (netCents(row) ?? 0), 0);
    appendText(list, 'p', 'Day P/L ' + money(daily), 'watch-detail');
    for (const row of rows) {
      const cents = netCents(row);
      const card = document.createElement('details');
      card.className = 'watch-card';
      const header = appendText(card, 'summary', '', 'watch-head');
      appendText(header, 'strong', row.off_time_uk + ' ' + row.course + ' · ' + row.horse, 'watch-horse');
      const css = { WIN: 'win', LOSS: 'loss', NR: 'nr' }[row.result_status] || '';
      appendText(header, 'span', labels[row.result_status], 'tag ' + css);
      appendText(card, 'p', (row.lay_odds ? 'Lay ' + row.lay_odds.toFixed(2) : 'Unpriced') +
        ' · ' + (cents === null ? 'No P/L' : money(cents)) +
        (row.historical ? ' · Historical entry' : ''), 'watch-detail');
      if (row.reason) appendText(card, 'p', row.reason, 'watch-detail');
      if (row.position) appendText(card, 'p', 'Finish ' + row.position, 'watch-detail');
      if (row.price_record) appendText(card, 'p', row.price_record, 'watch-detail');
      addLink(card, row.racecard_url, 'Racecard ↗');
      addLink(card, row.result_source_url, 'Results ↗');
      list.append(card);
    }
  }

  async function refresh() {
    if (request) return request;
    request = (async () => {
      const response = await fetch('data/watch-list.json', { cache: 'no-store' });
      if (!response.ok) throw new Error('Watch List unavailable');
      const data = await response.json();
      if (data.schema_version !== 1 || !Array.isArray(data.entries)) throw new Error('Invalid Watch List');
      ledger = data;
      const counts = { WIN: 0, LOSS: 0, NR: 0, PENDING: 0 };
      let net = 0;
      for (const row of ledger.entries) {
        counts[row.result_status]++;
        net += netCents(row) ?? 0;
      }
      tile.textContent = money(net) + ' paper P/L';
      totals.textContent = money(net) + ' total paper P/L · ' + counts.WIN + ' wins · ' +
        counts.LOSS + ' losses · ' + counts.NR + ' void · ' + counts.PENDING + ' pending. ' +
        '£' + ledger.liability_gbp + ' liability and ' + ledger.commission_rate * 100 +
        '% commission. Unpriced results count toward the record only.';
      const selected = date.value;
      const dates = [...new Set(ledger.entries.map(row => row.race_date))].sort().reverse();
      date.replaceChildren(...dates.map(day => new Option(day, day)));
      if (dates.includes(selected)) date.value = selected;
      paintRows();
    })().catch(() => {
      tile.textContent = 'Watch List unavailable';
      totals.textContent = 'Could not load the Watch List. Try opening it again.';
    }).finally(() => { request = null; });
    return request;
  }

  date.addEventListener('change', paintRows);
  window.jcmOpenWatchList = () => {
    dialog.showModal();
    refresh();
  };
  refresh();
})();
