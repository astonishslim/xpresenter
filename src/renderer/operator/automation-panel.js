/* global window */
// Diálogo de automação: entrada OSC (porta, só local ou rede) e regras "quando X, enviar OSC".
// O processo principal valida tudo de novo; aqui é só o formulário.
(function exposeAutomationPanel(root) {
  const $ = (id) => document.getElementById(id);
  const MAX_RULES = 30;

  function el(tag, props = {}, ...children) {
    const node = document.createElement(tag);
    Object.entries(props).forEach(([k, v]) => {
      if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
      else if (k === 'class') node.className = v;
      else if (k === 'value') node.value = v;
      else node.setAttribute(k, v);
    });
    node.append(...children);
    return node;
  }

  function initAutomationPanel({ api }) {
    const dialog = $('automation-dialog');
    let events = {};

    const statusText = (settings, status) => {
      if (!settings.oscIn.enabled) return 'Entrada OSC desligada.';
      if (status.error) return `Não foi possível escutar: ${status.error}`;
      return `Escutando em ${settings.oscIn.allowNetwork ? 'toda a rede' : 'este computador (127.0.0.1)'}, porta ${status.port}.`;
    };

    const ruleRow = (r = { event: 'item', host: '', port: 53000, address: '/', args: '' }) => {
      const event = el('select', { 'aria-label': 'Quando' }, ...Object.entries(events).map(([k, label]) => el('option', { value: k }, label)));
      event.value = r.event;
      return el('div', { class: 'row osc-rule' },
        event,
        el('input', { 'aria-label': 'Endereço do aparelho (IP ou nome)', placeholder: '192.168.0.20', value: r.host, maxlength: '253' }),
        el('input', { type: 'number', min: '1', max: '65535', class: 'narrow', 'aria-label': 'Porta', value: String(r.port) }),
        el('input', { 'aria-label': 'Endereço OSC', placeholder: '/cue/1/go', value: r.address, maxlength: '100' }),
        el('input', { 'aria-label': 'Argumentos', placeholder: 'argumentos', value: r.args, maxlength: '200' }),
        el('button', { type: 'button', class: 'ib', title: 'Remover regra', 'aria-label': 'Remover regra', onclick: (e) => e.currentTarget.parentElement.remove() },
          root.icons.create('x', 12)));
    };

    const readForm = () => ({
      oscIn: { enabled: $('osc-in-enabled').checked, port: Number($('osc-in-port').value), allowNetwork: $('osc-in-network').checked },
      rules: [...$('osc-rules').children].map((row) => {
        const [event, host, port, address, args] = row.querySelectorAll('select, input');
        return { event: event.value, host: host.value.trim(), port: Number(port.value), address: address.value.trim(), args: args.value.trim() };
      }),
    });

    const fill = ({ settings, status }) => {
      $('osc-in-enabled').checked = settings.oscIn.enabled;
      $('osc-in-port').value = String(settings.oscIn.port);
      $('osc-in-network').checked = settings.oscIn.allowNetwork;
      $('osc-in-status').textContent = statusText(settings, status);
      $('osc-rules').replaceChildren(...settings.rules.map(ruleRow));
    };

    $('btn-automation').addEventListener('click', async () => {
      const res = await api.automation.get();
      events = res.events;
      $('osc-commands').textContent = res.commands.join('\n');
      $('automation-error').textContent = '';
      fill(res);
      dialog.showModal();
    });
    $('osc-rule-add').addEventListener('click', () => {
      if ($('osc-rules').children.length < MAX_RULES) $('osc-rules').append(ruleRow());
    });
    $('automation-cancel').addEventListener('click', () => dialog.close());
    $('automation-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const form = readForm();
      const res = await api.automation.set(form);
      const dropped = form.rules.length - res.settings.rules.length;
      fill(res);
      $('automation-error').textContent = dropped
        ? `${dropped} regra(s) descartada(s): confira IP/nome, porta (1–65535) e endereço OSC (começa com /, sem espaços).`
        : '';
    });
  }

  root.initAutomationPanel = initAutomationPanel;
}(window));
