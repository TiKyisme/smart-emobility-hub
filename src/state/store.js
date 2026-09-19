export function createStore(initialState) {
  let state = structuredClone(initialState);
  const listeners = new Set();

  return {
    getState() {
      return state;
    },
    update(mutator) {
      mutator(state);
      for (const listener of listeners) listener(state);
    },
    replace(nextState) {
      state = structuredClone(nextState);
      for (const listener of listeners) listener(state);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
