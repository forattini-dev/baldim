export class IntervalScheduler {
  private readonly jobs = new Map<string, NodeJS.Timeout>();

  scheduleInterval(milliseconds: number, handler: () => void | Promise<void>, name: string): NodeJS.Timeout {
    this.stop(name);
    const timer = setInterval(() => {
      void Promise.resolve(handler()).catch(() => undefined);
    }, milliseconds);
    timer.unref?.();
    this.jobs.set(name, timer);
    return timer;
  }

  stop(name: string): boolean {
    const timer = this.jobs.get(name);
    if (!timer) return false;
    clearInterval(timer);
    this.jobs.delete(name);
    return true;
  }
}
