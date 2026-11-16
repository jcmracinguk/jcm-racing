(() => {
  const currency = new Intl.NumberFormat('en-GB', {
    style: 'currency', currency: 'GBP', signDisplay: 'exceptZero'
  });
  const money = cents => currency.format(cents / 100);
  let request;
  const dailyRate = document.getElementById('jcm-watch-daily-rate');

  function updateDailyRate(entries) {
    if (!dailyRate) return;
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date());
    const rows = entries.filter(row => row.race_date === today);
    const wins = rows.filter(row => row.result_status === 'WIN').length;
    const settled = wins + rows.filter(row => row.result_status === 'LOSS').length;
    const rate = settled ? Math.round(1000 * wins / settled) / 10 + '% success · ' + wins + '/' + settled + ' settled'
      : rows.length ? 'No settled results' : 'No candidates today';
    dailyRate.textContent = 'Today · ' + rate;
  }

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
      updateDailyRate(ledger.entries);
      return ledger;
    })().finally(() => { request = null; });
    return request;
  }

  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  window.jcmWatchList = {
    read,
    dateLabel(value) {
      const [year, month, day] = value.split('-');
      const number = Number(day);
      const suffix = number >= 11 && number <= 13 ? 'th' : ({1:'st',2:'nd',3:'rd'}[number % 10] || 'th');
      return number + suffix + ' ' + months[Number(month) - 1] + '-' + year.slice(-2);
    },
    counts(ledger) {
      const counts = { WIN: 0, LOSS: 0, NR: 0, PENDING: 0 };
      for (const row of ledger.entries) counts[row.result_status]++;
      return counts;
    },
    rowNet(ledger, row) {
      const cents = netCents(ledger, row);
      return cents === null ? 'No recorded price' : money(cents);
    },
    summary(ledger, rows) {
      return 'Day paper P/L ' + money(net(ledger, rows)) +
        ' · Total paper P/L ' + money(net(ledger, ledger.entries));
    }
  };

  read().catch(() => {
    if (dailyRate) dailyRate.textContent = 'Today · Results unavailable';
  });
})();
