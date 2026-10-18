const stage = window.createStage(document.getElementById('root'));
let lastState = null;

function render(state) {
  lastState = state;
  stage.update(state);
}

window.apresentador.getState().then(render);
window.apresentador.onState(render);
window.addEventListener('resize', () => lastState && stage.update(lastState));
