// Your overrules of the agents' decisions, stored in the kv table.
//
//   blocked              { SYMBOL: { ts, note } } — the agents never buy these
//   allowCorrectionBuys  'YYYY-MM-DD' — buy today even though the market filter would pause buys
//   positions            { [positionId]: { noFailedExit, noTimeExit, noTrail, noPartial } }

const KEY = 'overrides';
export const HOLD_FLAGS = ['noFailedExit', 'noTimeExit', 'noTrail', 'noPartial'];

export function getOverrides(db) {
  const o = db.kvGet(KEY, {}) || {};
  return { blocked: o.blocked || {}, allowCorrectionBuys: o.allowCorrectionBuys || null, positions: o.positions || {} };
}

function save(db, o) {
  db.kvSet(KEY, o);
  return o;
}

export function isBlocked(db, symbol) {
  return !!getOverrides(db).blocked[symbol];
}

export function setBlocked(db, symbol, blocked, note = '') {
  const o = getOverrides(db);
  if (blocked) o.blocked[symbol] = { ts: new Date().toISOString(), note };
  else delete o.blocked[symbol];
  return save(db, o);
}

export function correctionBuysAllowed(db, date) {
  return getOverrides(db).allowCorrectionBuys === date;
}

export function setCorrectionBuys(db, date) {
  const o = getOverrides(db);
  o.allowCorrectionBuys = date || null;
  return save(db, o);
}

/** The exit rules you switched off for one position, e.g. { noTimeExit: true }. */
export function positionHolds(db, id) {
  return getOverrides(db).positions[id] || {};
}

export function setPositionHold(db, id, flag, on) {
  if (!HOLD_FLAGS.includes(flag)) throw Object.assign(new Error('Unknown rule'), { status: 400 });
  const o = getOverrides(db);
  const cur = { ...(o.positions[id] || {}) };
  if (on) cur[flag] = true;
  else delete cur[flag];
  if (Object.keys(cur).length) o.positions[id] = cur;
  else delete o.positions[id];
  return save(db, o);
}

/** Forget holds for positions that are no longer open. */
export function pruneHolds(db, openIds) {
  const o = getOverrides(db);
  const keep = new Set(openIds.map(String));
  let changed = false;
  for (const id of Object.keys(o.positions)) {
    if (!keep.has(id)) {
      delete o.positions[id];
      changed = true;
    }
  }
  if (changed) save(db, o);
  return o;
}
