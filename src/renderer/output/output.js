const audio = new URLSearchParams(location.search).get('audio') === '1';
const stage = window.createStage(document.getElementById('root'), { audio });
let lastState = null;

function render(state) {
  lastState = state;
  stage.update(state);
}

window.apresentador.getState().then(render);
window.apresentador.onState(render);
window.addEventListener('resize', () => lastState && stage.update(lastState));
