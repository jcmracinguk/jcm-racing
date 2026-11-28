(() => {
  let request;
  const isSettled = row => ['WIN', 'LOSS', 'NR'].includes(row.result_status) &&
    Date.parse(row.scheduled_off_dt) <= Date.now() &&
    (!row.researchOnly || window.jcmAcceptedResult(row));

  function netCents(ledger, row) {
    if (row.researchOnly || row.result_status === 'NR') return 0;
    if (row.result_status === 'LOSS') return -ledger.liability_gbp * 100;
    if (row.result_status !== 'WIN') return 0;
    if (!Number.isFinite(row.lay_odds) || row.lay_odds <= 1) return 15000;
    return Math.round(ledger.liability_gbp * (1 - ledger.commission_rate) * 100 / (row.lay_odds - 1));
  }

  async function read() {
    if (request) return request;
    request = (async () => {
      const ledger = await window.jcmReadRacingData('data/watch-list.json');
      if (ledger.schema_version !== 1 || !Array.isArray(ledger.entries)) throw new Error('Invalid Watch List');
      return ledger;
    })().finally(() => { request = null; });
    return request;
  }

  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const weekday = new Intl.DateTimeFormat('en-GB', { weekday: 'short', timeZone: 'UTC' });
  window.jcmWatchList = {
    read,
    isSettled,
    netCents,
    dateLabel(value) {
      const [year, month, day] = value.split('-');
      const number = Number(day);
      const suffix = number >= 11 && number <= 13 ? 'th' : ({1:'st',2:'nd',3:'rd'}[number % 10] || 'th');
      return weekday.format(new Date(value + 'T00:00:00Z')) + ' ' + number + suffix + ' ' +
        months[Number(month) - 1] + '-' + year.slice(-2);
    },
    counts(ledger) {
      const counts = { WIN: 0, LOSS: 0, NR: 0, PENDING: 0 };
      for (const row of ledger.entries) counts[row.result_status]++;
      return counts;
    },
  };

})();
