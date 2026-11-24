// Pivot app notifications (Web Push). Works on iPhone (iOS 16.4+, Pivot added to the home screen),
// Android and desktop browsers. No third-party app or account needed.

import webpush from 'web-push';

export class WebPush {
  constructor({ db, publicUrl, log }) {
    this.db = db;
    this.log = log || (() => {});
    let keys = db.kvGet('vapidKeys');
    if (!keys) {
      keys = webpush.generateVAPIDKeys();
      db.kvSet('vapidKeys', keys);
    }
    this.publicKey = keys.publicKey;
    // Apple requires a real contact subject; the app's own address is accepted.
    webpush.setVapidDetails(publicUrl && publicUrl.startsWith('https') ? publicUrl : 'mailto:pivot@localhost.invalid', keys.publicKey, keys.privateKey);
  }

  subs() {
    return this.db.kvGet('pushSubs', []);
  }

  get enabled() {
    return this.subs().length > 0;
  }

  add(sub, device) {
    const list = this.subs().filter((s) => s.sub.endpoint !== sub.endpoint);
    list.push({ sub, device: String(device || 'This device').slice(0, 60), added: new Date().toISOString() });
    this.db.kvSet('pushSubs', list);
    return list.length;
  }

  remove(endpoint) {
    this.db.kvSet('pushSubs', this.subs().filter((s) => s.sub.endpoint !== endpoint));
  }

  clear() {
    this.db.kvSet('pushSubs', []);
  }

  /** Send to every registered device. `msg`: { title, body, url, tag, approvalId } */
  async send(msg) {
    const list = this.subs();
    if (!list.length) return 0;
    let ok = 0;
    await Promise.all(
      list.map(async (s) => {
        try {
          await webpush.sendNotification(s.sub, JSON.stringify(msg), { TTL: 15 * 60, urgency: msg.urgent ? 'high' : 'normal' });
          ok++;
        } catch (e) {
          if (e.statusCode === 404 || e.statusCode === 410) {
            this.remove(s.sub.endpoint); // device unsubscribed or app removed
            this.log(`A device stopped receiving notifications (${s.device}) — removed`, 'warn');
          } else this.log(`Notification to ${s.device} failed: ${e.statusCode || e.message}`, 'warn');
        }
      }),
    );
    return ok;
  }
}

/** Turn a Telegram-style HTML message into a notification title + body. */
export function toPlain(html) {
  const text = String(html)
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const title = (lines.shift() || 'Pivot').slice(0, 80);
  const body = lines.join('\n').slice(0, 400);
  return { title, body };
}
