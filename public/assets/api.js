/* ПОРЦИЯ — общий клиент API: загрузка состояния + live-обновления через SSE */
(function () {
  const Porcia = {};

  Porcia.api = async function (method, url, body) {
    const res = await fetch(url, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined
    });
    let data = null;
    try { data = await res.json(); } catch (e) { /* пустой ответ */ }
    if (!res.ok) throw new Error((data && data.error) || 'Ошибка ' + res.status);
    return data;
  };

  Porcia.money = (n) => {
    const v = Math.round(Number(n) || 0);
    return v.toLocaleString('ru-RU') + ' ₽';
  };

  Porcia.time = (iso) => new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

  Porcia.minsAgo = (iso) => Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));

  Porcia.esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));

  /** Подписка на live-события сервера. onEvent(type, payload) */
  Porcia.subscribe = function (onEvent) {
    let src;
    const connect = () => {
      src = new EventSource('/api/events');
      ['order', 'menu', 'stats', 'reset'].forEach(type => {
        src.addEventListener(type, (e) => {
          let payload = null;
          try { payload = JSON.parse(e.data); } catch (err) { }
          onEvent(type, payload);
        });
      });
      src.onerror = () => {
        // EventSource переподключается сам; на всякий случай пересоздаём
        if (src.readyState === 2) setTimeout(connect, 3000);
      };
    };
    connect();
    return () => src && src.close();
  };

  Porcia.toast = function (text, isError) {
    let el = document.querySelector('.toast');
    if (!el) {
      el = document.createElement('div');
      el.className = 'toast';
      document.body.appendChild(el);
    }
    el.textContent = text;
    el.classList.toggle('err', !!isError);
    el.classList.add('show');
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.remove('show'), 2600);
  };

  /** Мини-подтверждение/ввод для админки */
  Porcia.ask = (message, value) => window.prompt(message, value == null ? '' : value);

  window.Porcia = Porcia;
})();
