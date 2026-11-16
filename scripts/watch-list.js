(() => {
  const tile = document.getElementById('jcm-watch-summary');
  if (!tile) return;

  const currency = new Intl.NumberFormat('en-GB', {
    style: 'currency', currency: 'GBP', signDisplay: 'exceptZero'
  });
  const money = cents => currency.format(cents / 100);
  let request;

  function netCents(ledger, row) {
    if (row.result_status === 'NR') return 0;
    if (!Number.isFinite(row.lay_odds) || row.lay_odds <= 1) return null;
    if (row.result_status === 'LOSS') return -ledger.liability_gbp * 100;
    if (row.result_status !== 'WIN') return 0;
    return Math.round(ledger.liability_gbp * (1 - ledger.commission_rate) * 100 / (row.lay_odds - 1));
  }

  const net = (ledger, rows) => rows.reduce((total, row) => total + (netCents(ledger, row) ?? 0), 0);

  async function read() {
    if (request) return request;
    request = (async () => {
      const response = await fetch('data/watch-list.json', { cache: 'no-store' });
      if (!response.ok) throw new Error('Watch List unavailable');
      const ledger = await response.json();
      if (ledger.schema_version !== 1 || !Array.isArray(ledger.entries)) throw new Error('Invalid Watch List');
      tile.textContent = money(net(ledger, ledger.entries)) + ' paper P/L';
      return ledger;
    })().finally(() => { request = null; });
    return request;
  }

  window.jcmWatchList = {
    read,
    rowNet(ledger, row) {
      const cents = netCents(ledger, row);
      return cents === null ? 'No recorded price' : money(cents);
    },
    summary(ledger, rows) {
      const counts = { WIN: 0, LOSS: 0, NR: 0, PENDING: 0 };
      for (const row of ledger.entries) counts[row.result_status]++;
      return 'Day P/L ' + money(net(ledger, rows)) + ' · Total P/L ' + money(net(ledger, ledger.entries)) +
        ' · ' + counts.WIN + ' wins · ' + counts.LOSS + ' losses · ' + counts.NR +
        ' void · ' + counts.PENDING + ' pending. £' + ledger.liability_gbp +
        ' liability and ' + ledger.commission_rate * 100 + '% commission. Unpriced results count toward the record only.';
    }
  };

  read().catch(() => { tile.textContent = 'Watch List unavailable'; });
})();
