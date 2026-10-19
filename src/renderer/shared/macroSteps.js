// Passos que um macro pode ter (lista fechada): o núcleo valida e executa, o operador monta o editor com isto.
// value: o que o passo recebe (name = nome de algo salvo; minutes; time = HH:MM; null = nada).
// source: de onde vem a lista de nomes no editor (themes, props, messages).
(function defineMacroSteps(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.macroSteps = api;
}(typeof window !== 'undefined' ? window : globalThis, () => {
  const STEP_TYPES = {
    theme: { label: 'Aplicar tema', value: 'name', source: 'themes' },
    propOn: { label: 'Ligar prop', value: 'name', source: 'props' },
    propOff: { label: 'Desligar prop', value: 'name', source: 'props' },
    propsClear: { label: 'Desligar todos os props', value: null },
    message: { label: 'Mostrar mensagem (modelo sem campos)', value: 'name', source: 'messages' },
    messageClear: { label: 'Tirar a mensagem', value: null },
    coverOn: { label: 'Capa: ligar', value: null },
    coverOff: { label: 'Capa: desligar', value: null },
    blackOn: { label: 'Tela preta: ligar', value: null },
    blackOff: { label: 'Tela preta: desligar', value: null },
    clear: { label: 'Limpar o conteúdo', value: null },
    timerCountdown: { label: 'Cronômetro: regressiva (minutos)', value: 'minutes' },
    timerUntil: { label: 'Cronômetro: até o horário', value: 'time' },
    timerReset: { label: 'Cronômetro: zerar', value: null },
    timerStart: { label: 'Cronômetro: iniciar', value: null },
    timerPause: { label: 'Cronômetro: pausar', value: null },
    timerShow: { label: 'Cronômetro: mostrar na tela', value: null },
    timerHide: { label: 'Cronômetro: esconder da tela', value: null },
  };
  return { STEP_TYPES };
}));
