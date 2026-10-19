/* global window */
// Props: elementos fixos sobre a projeção (logo, QR do Pix, faixa com o nome). Cada prop é um botão que liga e
// desliga; a lista e a validação ficam no processo principal, e o que está no ar vem do estado.
(function exposePropsPanel(root) {
  const CONFIRM_MS = 3000;
  const POSITION_LABELS = {
    'top-left': 'Canto superior esquerdo',
    'top-right': 'Canto superior direito',
    'bottom-left': 'Canto inferior esquerdo',
    'bottom-right': 'Canto inferior direito',
    center: 'Centro',
    'lower-third': 'Faixa inferior (terço)',
  };
  const SIZES = [10, 20, 30, 40, 50, 60];
  const $ = (id) => document.getElementById(id);
  const cleanError = (err) => String(err && err.message).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');

  function el(tag, props = {}, ...children) {
    const node = document.createElement(tag);
    Object.entries(props).forEach(([k, v]) => {
      if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, v);
    });
    node.append(...children);
    return node;
  }
  const fileNameOf = (url) => {
    try {
      return decodeURIComponent(String(url).split('/').pop());
    } catch {
      return String(url);
    }
  };

  function initPropsPanel({ api }) {
    let props = [];
    let state = null;
    let imageValue = '';
    const setStatus = (text) => { $('prop-status').textContent = text; };
    const isOn = (prop) => Boolean(state) && state.layers.props.items.some((i) => i.id === prop.id);

    // ---------- Lista ----------
    async function toggle(prop) {
      try {
        await api.dispatch(isOn(prop) ? { type: 'hideProp', id: prop.id } : { type: 'showProp', prop });
        setStatus('');
      } catch (err) {
        setStatus(cleanError(err)); // ex.: a imagem foi movida ou apagada
      }
    }

    function renderList() {
      $('prop-list').replaceChildren(...(props.length ? props.map((prop) => {
        const toggleBtn = el('button', {
          class: 'prop-toggle', type: 'button', 'data-id': prop.id, 'aria-pressed': String(isOn(prop)),
          title: `${isOn(prop) ? 'Desligar' : 'Ligar'} ${prop.name}`, onclick: () => toggle(prop),
        }, root.icons.create(prop.kind === 'image' ? 'image' : 'type', 12), prop.name);
        const editBtn = el('button', {
          class: 'mini', type: 'button', title: `Editar ${prop.name}`, 'aria-label': `Editar ${prop.name}`, onclick: () => openDialog(prop),
        }, root.icons.create('pencil', 12));
        return el('div', { class: 'prop-chip' }, toggleBtn, editBtn);
      }) : [el('span', { class: 'muted' }, 'Nenhum prop. Use + para criar (logo, QR do Pix, faixa com o nome).')]));
    }

    // ---------- Criar e editar ----------
    const dialog = $('prop-dialog');
    $('prop-position').replaceChildren(...Object.entries(POSITION_LABELS).map(([v, label]) => el('option', { value: v }, label)));
    $('prop-size').replaceChildren(...SIZES.map((v) => el('option', { value: String(v) }, `Tamanho ${v}`)));

    const syncKind = () => {
      const image = $('prop-kind').value === 'image';
      $('prop-text').hidden = image;
      $('prop-pick').hidden = !image;
      $('prop-file').hidden = !image;
    };
    $('prop-kind').addEventListener('change', syncKind);
    $('prop-pick').addEventListener('click', async () => {
      const url = await api.background.pickImage();
      if (!url) return;
      imageValue = url;
      $('prop-file').textContent = fileNameOf(url);
    });

    function openDialog(prop) {
      dialog.dataset.id = prop ? prop.id : '';
      $('prop-name').value = prop ? prop.name : '';
      $('prop-kind').value = prop ? prop.kind : 'image';
      $('prop-text').value = prop && prop.kind === 'text' ? prop.value : '';
      imageValue = prop && prop.kind === 'image' ? prop.value : '';
      $('prop-file').textContent = imageValue ? fileNameOf(imageValue) : 'Nenhuma imagem escolhida';
      $('prop-position').value = prop ? prop.position : 'top-right';
      $('prop-size').value = String(prop ? prop.size : 20);
      $('prop-error').textContent = '';
      $('prop-delete').hidden = !prop;
      resetDeleteConfirm();
      syncKind();
      dialog.showModal();
      $('prop-name').focus();
    }
    $('btn-prop-new').addEventListener('click', () => openDialog(null));
    $('prop-cancel').addEventListener('click', () => dialog.close());

    $('prop-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = dialog.dataset.id || undefined;
      const kind = $('prop-kind').value;
      const res = await api.props.save({
        id,
        name: $('prop-name').value,
        kind,
        value: kind === 'image' ? imageValue : $('prop-text').value,
        position: $('prop-position').value,
        size: Number($('prop-size').value),
      });
      if (!res.ok) { $('prop-error').textContent = res.reason; return; }
      props = res.props;
      renderList();
      dialog.close();
      // Prop editado que está no ar: o ao vivo passa a mostrar a versão nova.
      const saved = id ? props.find((p) => p.id === id) : null;
      if (saved && isOn(saved)) toggleSafe({ type: 'showProp', prop: saved });
    });
    const toggleSafe = (action) => api.dispatch(action).catch((err) => setStatus(cleanError(err)));

    // Excluir com dois cliques, como temas, layouts e modelos.
    let confirmTimer = null;
    const setDeleteState = (confirming) => {
      const btn = $('prop-delete');
      btn.classList.toggle('confirming', confirming);
      btn.textContent = confirming ? 'Clique de novo para excluir' : 'Excluir';
    };
    function resetDeleteConfirm() {
      clearTimeout(confirmTimer);
      confirmTimer = null;
      setDeleteState(false);
    }
    $('prop-delete').addEventListener('click', async () => {
      if (!confirmTimer) {
        setDeleteState(true);
        confirmTimer = setTimeout(resetDeleteConfirm, CONFIRM_MS);
        return;
      }
      const id = dialog.dataset.id;
      const res = await api.props.remove(id);
      props = res.props;
      await toggleSafe({ type: 'hideProp', id });
      renderList();
      dialog.close();
    });

    return {
      async load() {
        props = await api.props.list();
        renderList();
      },
      names: () => props.map((p) => p.name),
      // Só atualiza o aceso/apagado dos botões (a lista não é refeita a cada mudança do estado).
      render(next) {
        state = next;
        $('prop-list').querySelectorAll('.prop-toggle').forEach((btn) => {
          const prop = props.find((p) => p.id === btn.dataset.id);
          if (prop) btn.setAttribute('aria-pressed', String(isOn(prop)));
        });
      },
    };
  }

  root.initPropsPanel = initPropsPanel;
}(window));
