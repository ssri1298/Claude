// Single-user password protection with signed, HttpOnly session cookies.

import { scryptSync, randomBytes, timingSafeEqual, createHmac } from 'node:crypto';

const COOKIE = 'pivot_session';
const DAYS = 30;

export function createAuth(db) {
  let secret = db.kvGet('sessionSecret');
  if (!secret) {
    secret = randomBytes(32).toString('hex');
    db.kvSet('sessionSecret', secret);
  }
  const attempts = new Map();

  const sign = (payload) => createHmac('sha256', secret).update(payload).digest('base64url');
  const hasPassword = () => !!db.kvGet('auth');

  function setPassword(pw) {
    if (!pw || pw.length < 8) throw Object.assign(new Error('Use at least 8 characters'), { status: 400 });
    const salt = randomBytes(16).toString('hex');
    const hash = scryptSync(pw, salt, 64).toString('hex');
    db.kvSet('auth', { salt, hash });
  }

  function checkPassword(pw) {
    const a = db.kvGet('auth');
    if (!a) return false;
    const h = scryptSync(String(pw || ''), a.salt, 64);
    return timingSafeEqual(h, Buffer.from(a.hash, 'hex'));
  }

  function issue(res, req) {
    const exp = Date.now() + DAYS * 86400000;
    const payload = `v1.${exp}`;
    const token = `${payload}.${sign(payload)}`;
    const secure = req.secure || req.headers['x-forwarded-proto'] === 'https';
    res.setHeader('Set-Cookie', `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${DAYS * 86400}${secure ? '; Secure' : ''}`);
  }

  function valid(req) {
    const m = (req.headers.cookie || '').match(new RegExp(`${COOKIE}=([^;]+)`));
    if (!m) return false;
    const [v, exp, sig] = m[1].split('.');
    if (!v || !exp || !sig) return false;
    const expect = sign(`${v}.${exp}`);
    if (expect.length !== sig.length || !timingSafeEqual(Buffer.from(expect), Buffer.from(sig))) return false;
    return Number(exp) > Date.now();
  }

  function clear(res) {
    res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
  }

  function throttle(ip) {
    const now = Date.now();
    const a = (attempts.get(ip) || []).filter((t) => now - t < 15 * 60000);
    a.push(now);
    attempts.set(ip, a);
    return a.length > 10;
  }

  return { hasPassword, setPassword, checkPassword, issue, valid, clear, throttle };
}
