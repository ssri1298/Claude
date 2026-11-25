// Price alerts on any Nifty 500 stock: "tell me when X goes above / below ₹Y".
// Checked on every heartbeat against live prices; each alert fires once (re-arm it from the app).

const inr = (x) => '₹' + Number(x).toLocaleString('en-IN', { maximumFractionDigits: 2 });

export function loadAlerts(ctx) {
  ctx.alerts = ctx.db.all('SELECT * FROM alerts WHERE active = 1');
  return ctx.alerts;
}

export function checkAlerts(ctx) {
  if (!ctx.alerts?.length) return [];
  const fired = [];
  for (const al of ctx.alerts) {
    const q = ctx.quotes.get(al.token);
    if (!q?.ltp) continue;
    const hit = al.op === 'below' ? q.ltp <= al.price : q.ltp >= al.price;
    if (!hit) continue;
    const ts = new Date().toISOString();
    ctx.db.run('UPDATE alerts SET active = 0, triggered = ?, triggered_price = ? WHERE id = ?', ts, q.ltp, al.id);
    fired.push({ ...al, ltp: q.ltp });
    ctx.bus.log('You', `🔔 Price alert: ${al.symbol} is ${al.op === 'below' ? 'down to' : 'up to'} ${inr(q.ltp)} (your alert: ${al.op} ${inr(al.price)})${al.note ? ' — ' + al.note : ''}`, { level: 'success' });
    ctx.notify?.('alerts', `🔔 <b>${al.symbol}</b> is ${al.op === 'below' ? 'down to' : 'up to'} ${inr(q.ltp)}\nYour alert: ${al.op} ${inr(al.price)}${al.note ? `\n${al.note}` : ''}`, ctx.publicUrl ? [[{ text: 'Open in Pivot', url: `${ctx.publicUrl}/#/stock/${al.symbol}` }]] : undefined);
  }
  if (fired.length) {
    loadAlerts(ctx);
    ctx.bus.push('alerts', {});
  }
  return fired;
}
