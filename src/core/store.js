const { initialState, reduce } = require('./state');

function createStore(state = initialState()) {
  let current = state;
  const listeners = new Set();
  return {
    getState: () => current,
    dispatch(action) {
      const next = reduce(current, action);
      if (next === current) return current;
      current = next;
      listeners.forEach((listener) => {
        try {
          listener(current);
        } catch (err) {
          console.error(`[store] assinante falhou: ${err.message}`);
        }
      });
      return current;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

module.exports = { createStore };
