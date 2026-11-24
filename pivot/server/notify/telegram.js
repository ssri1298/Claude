// Telegram bot: sends alerts and receives Approve / Reject button taps (long polling, no webhook needed).

export class Telegram {
  constructor({ token, chatId, onCallback, onCommand, onPair, log, getPairCode }) {
    this.getPairCode = getPairCode;
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
    let res;
    try {
      res = await fetch(`https://api.telegram.org/bot${this.token}/${method}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body || {}),
        signal: AbortSignal.timeout(method === 'getUpdates' ? 40000 : 15000),
      });
    } catch (e) {
      throw new Error(`the server could not reach Telegram (${e.cause?.code || e.name || e.message})`);
    }
    const json = await res.json().catch(() => ({}));
    if (!json.ok) {
      if (res.status === 401 || res.status === 404) throw new Error('Telegram says this token is wrong (Unauthorized). Copy the token again from @BotFather → /mybots → your bot → API Token');
      throw new Error(json.description || `Telegram ${method} failed (${res.status})`);
    }
    return json.result;
  }

  async start() {
    if (!this.enabled || this.running) return;
    this.running = true;
    try {
      const me = await this.api('getMe');
      this.botName = me.username;
      this.ok = true;
      this.error = null;
    } catch (e) {
      this.ok = false;
      this.error = e.message;
      this.log(`Telegram: ${e.message}`, 'warn');
      this.running = false;
      return false;
    }
    this.poll();
    return true;
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
    const digits = text.match(/^(?:\/start\s+)?(\d{6})$/)?.[1];
    if (text.startsWith('/start') || digits) {
      const code = digits || text.split(/\s+/)[1];
      const expected = this.getPairCode?.() || this.pairCode;
      this.log(`Telegram: received "${text.slice(0, 20)}" from chat ${m.chat.id}`);
      if (!this.chatId && expected && code === expected) {
        this.chatId = String(m.chat.id);
        this.onPair?.(this.chatId);
        await this.send('✅ <b>Pivot is connected.</b>\nYou will get trade approvals, fills and daily reports here.\n\nCommands: /status /positions /picks /pause /resume');
      } else if (String(m.chat.id) === String(this.chatId)) {
        await this.send('👋 Pivot is already connected to this chat.');
      } else if (this.chatId) {
        await this.api('sendMessage', { chat_id: m.chat.id, text: 'This bot is already connected to another chat.' });
      } else if (expected && !code) {
        await this.api('sendMessage', { chat_id: m.chat.id, text: '👋 Hi! Now send me the 6-digit code shown in Pivot → Settings → Telegram.' });
      } else if (!expected) {
        await this.api('sendMessage', { chat_id: m.chat.id, text: '👋 Almost there! In Pivot, open Settings → Telegram and tap “Pair”. Then send me the 6-digit code it shows.' });
      } else {
        await this.api('sendMessage', { chat_id: m.chat.id, text: '❌ That code does not match. Send the 6-digit code currently shown in Pivot → Settings → Telegram (tap “Pair” again for a new one).' });
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
