// Telegram bot: sends alerts and receives Approve / Reject button taps (long polling, no webhook needed).

export class Telegram {
  constructor({ token, chatId, onCallback, onCommand, onPair, log }) {
    this.token = token;
    this.chatId = chatId;
    this.onCallback = onCallback;
    this.onCommand = onCommand;
    this.onPair = onPair;
    this.log = log || (() => {});
    this.offset = 0;
    this.running = false;
    this.pairCode = null;
    this.ok = false;
    this.botName = null;
  }

  get enabled() {
    return !!this.token;
  }

  async api(method, body) {
    const res = await fetch(`https://api.telegram.org/bot${this.token}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
      signal: AbortSignal.timeout(method === 'getUpdates' ? 40000 : 15000),
    });
    const json = await res.json();
    if (!json.ok) throw new Error(json.description || `Telegram ${method} failed`);
    return json.result;
  }

  async start() {
    if (!this.enabled || this.running) return;
    this.running = true;
    try {
      const me = await this.api('getMe');
      this.botName = me.username;
      this.ok = true;
    } catch (e) {
      this.ok = false;
      this.log(`Telegram bot token not accepted: ${e.message}`, 'warn');
      this.running = false;
      return;
    }
    this.poll();
  }

  stop() {
    this.running = false;
  }

  async poll() {
    while (this.running) {
      try {
        const updates = await this.api('getUpdates', { offset: this.offset, timeout: 30, allowed_updates: ['message', 'callback_query'] });
        for (const u of updates) {
          this.offset = u.update_id + 1;
          await this.handle(u).catch((e) => this.log(`Telegram: ${e.message}`, 'warn'));
        }
      } catch (e) {
        if (!this.running) break;
        await new Promise((r) => setTimeout(r, 5000));
      }
    }
  }

  async handle(u) {
    if (u.callback_query) {
      const q = u.callback_query;
      if (String(q.message?.chat?.id) !== String(this.chatId)) return;
      const [action, id] = (q.data || '').split(':');
      const reply = (await this.onCallback?.(action, Number(id), q)) || 'Done';
      await this.api('answerCallbackQuery', { callback_query_id: q.id, text: reply });
      return;
    }
    const m = u.message;
    if (!m?.text) return;
    const text = m.text.trim();
    if (text.startsWith('/start')) {
      const code = text.split(/\s+/)[1];
      if (!this.chatId && this.pairCode && code === this.pairCode) {
        this.chatId = String(m.chat.id);
        this.onPair?.(this.chatId);
        await this.send('✅ <b>Pivot is connected.</b>\nYou will get trade approvals, fills and daily reports here.\n\nCommands: /status /positions /picks /pause /resume');
      } else if (String(m.chat.id) === String(this.chatId)) {
        await this.send('👋 Pivot is already connected to this chat.');
      } else {
        await this.api('sendMessage', { chat_id: m.chat.id, text: 'This bot is private. Open Pivot → Settings → Telegram to get your pairing code.' });
      }
      return;
    }
    if (String(m.chat.id) !== String(this.chatId)) return;
    const reply = await this.onCommand?.(text.split(/\s+/)[0].toLowerCase());
    if (reply) await this.send(reply);
  }

  async send(text, buttons) {
    if (!this.enabled || !this.chatId) return null;
    const body = { chat_id: this.chatId, text, parse_mode: 'HTML', disable_web_page_preview: true };
    if (buttons) body.reply_markup = { inline_keyboard: buttons };
    try {
      return await this.api('sendMessage', body);
    } catch (e) {
      this.log(`Telegram send failed: ${e.message}`, 'warn');
      return null;
    }
  }

  async edit(messageId, text) {
    if (!this.enabled || !this.chatId || !messageId) return;
    try {
      await this.api('editMessageText', { chat_id: this.chatId, message_id: messageId, text, parse_mode: 'HTML' });
    } catch {
      /* message may be too old */
    }
  }
}

export const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
