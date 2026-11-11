// Share identical live/prefetch work without caching failures.
export class PendingRequests<T> {
  private requests = new Map<string, Promise<T>>();

  run(key: string, operation: () => Promise<T>): Promise<T> {
    const existing = this.requests.get(key);
    if (existing) return existing;
    const promise = Promise.resolve().then(operation).finally(() => {
      if (this.requests.get(key) === promise) this.requests.delete(key);
    });
    this.requests.set(key, promise);
    return promise;
  }
}
