// Prevent a pending session restore or login probe from completing after logout.
export class SessionGate {
  private pending = new Set<Promise<unknown>>();
  private loggingOut = false;
  private generation = 0;

  current(): number { return this.generation; }
  valid(generation: number): boolean { return !this.loggingOut && generation === this.generation; }

  async run<T>(operation: () => Promise<T>): Promise<T> {
    if (this.loggingOut) throw new Error('正在退出登录');
    const generation = this.generation;
    const pending = Promise.resolve().then(() => {
      if (!this.valid(generation)) throw new Error('登录操作已取消');
      return operation();
    });
    this.pending.add(pending);
    try { return await pending; } finally { this.pending.delete(pending); }
  }

  async logout(cancel: () => void, operation: () => Promise<void>): Promise<void> {
    if (this.loggingOut) throw new Error('正在退出登录');
    this.loggingOut = true;
    this.generation++;
    try {
      cancel();
      await Promise.allSettled([...this.pending]);
      await operation();
    } finally { this.loggingOut = false; }
  }
}
