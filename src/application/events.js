// Observer, simple event bus. new stuff on publish = add a subscriber
class EventBus {
  constructor() { this.handlers = new Map(); }
  on(name, fn) {
    if (!this.handlers.has(name)) this.handlers.set(name, []);
    this.handlers.get(name).push(fn);
    return this;
  }
  emit(name, payload) {
    (this.handlers.get(name) || []).forEach((fn) => fn(payload));
  }
}
module.exports = EventBus;
