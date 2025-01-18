type Callback<T> = (arg: T) => void;

export class Emitter<T> {
  private events: Record<string, Callback<T>[]> = {};

  subscribe(name: string, callback: Callback<T>) {
    if (!this.events[name]) {
      this.events[name] = [];
    }

    this.events[name].push(callback);
  }

  unsubscribe(name: string, callback: Callback<T>) {
    const callbacks = this.events[name];
    if (!callbacks) {
      return;
    }
    const index = callbacks.findIndex((c) => c === callback);

    if (index > -1) {
      callbacks.splice(index, 1);
    }

    if (callbacks.length === 0) {
      delete this.events[name];
    }
  }

  publish(name: string, event: T) {
    const callbacks = this.events[name];
    if (!callbacks) {
      return;
    }

    callbacks.forEach((c) => c(event));
  }
}
