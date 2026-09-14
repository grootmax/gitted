export interface TaskItem {
  filePath: string;
  priority: 'high' | 'normal' | 'low';
  content?: string;
  addedAt: number;
}

export type TaskProcessor = (item: TaskItem) => Promise<void>;

export interface TaskQueueOptions {
  concurrency?: number;
  throttleIntervalMs?: number; // Delay between tasks to keep CPU <15%
}

export class TaskQueue {
  private highPriorityQueue: TaskItem[] = [];
  private normalPriorityQueue: TaskItem[] = [];
  private lowPriorityQueue: TaskItem[] = [];
  private pendingFiles: Set<string> = new Set();
  private processor: TaskProcessor | null = null;
  private throttleIntervalMs: number;
  private concurrency: number;
  private activeCount: number = 0;

  constructor(options: TaskQueueOptions = {}) {
    this.concurrency = options.concurrency || 1; // Default single worker to avoid CPU spikes
    this.throttleIntervalMs = options.throttleIntervalMs || 20; // 20ms pause yields event loop
  }

  public setProcessor(processor: TaskProcessor): void {
    this.processor = processor;
  }

  public enqueue(
    filePath: string,
    priority: 'high' | 'normal' | 'low' = 'normal',
    content?: string
  ): void {
    if (this.pendingFiles.has(filePath)) {
      // Already queued, update item if higher priority
      const existing = this.findInQueue(filePath);
      if (existing) {
        if (priority === 'high' && existing.priority !== 'high') {
          this.removeFromQueue(filePath);
          existing.priority = 'high';
          existing.content = content || existing.content;
          this.highPriorityQueue.push(existing);
        } else if (content) {
          existing.content = content;
        }
        return;
      }
    }

    const item: TaskItem = {
      filePath,
      priority,
      content,
      addedAt: Date.now(),
    };

    this.pendingFiles.add(filePath);

    if (priority === 'high') {
      this.highPriorityQueue.push(item);
    } else if (priority === 'normal') {
      this.normalPriorityQueue.push(item);
    } else {
      this.lowPriorityQueue.push(item);
    }

    // Schedule task processing asynchronously in next tick to avoid blocking main caller
    setImmediate(() => this.processNext());
  }

  private findInQueue(filePath: string): TaskItem | undefined {
    return (
      this.highPriorityQueue.find((i) => i.filePath === filePath) ||
      this.normalPriorityQueue.find((i) => i.filePath === filePath) ||
      this.lowPriorityQueue.find((i) => i.filePath === filePath)
    );
  }

  private removeFromQueue(filePath: string): void {
    this.highPriorityQueue = this.highPriorityQueue.filter((i) => i.filePath !== filePath);
    this.normalPriorityQueue = this.normalPriorityQueue.filter((i) => i.filePath !== filePath);
    this.lowPriorityQueue = this.lowPriorityQueue.filter((i) => i.filePath !== filePath);
  }

  private popNext(): TaskItem | undefined {
    if (this.highPriorityQueue.length > 0) return this.highPriorityQueue.shift();
    if (this.normalPriorityQueue.length > 0) return this.normalPriorityQueue.shift();
    if (this.lowPriorityQueue.length > 0) return this.lowPriorityQueue.shift();
    return undefined;
  }

  private async processNext(): Promise<void> {
    if (this.activeCount >= this.concurrency || !this.processor) {
      return;
    }

    const item = this.popNext();
    if (!item) {
      return;
    }

    this.activeCount++;
    this.pendingFiles.delete(item.filePath);

    try {
      await this.processor(item);
    } catch {
      // Task processing error handling
    } finally {
      this.activeCount--;

      // Yield event loop to ensure CPU usage remains throttled (<15%)
      if (this.throttleIntervalMs > 0) {
        setTimeout(() => this.processNext(), this.throttleIntervalMs);
      } else {
        setImmediate(() => this.processNext());
      }
    }
  }

  public get pendingCount(): number {
    return (
      this.highPriorityQueue.length +
      this.normalPriorityQueue.length +
      this.lowPriorityQueue.length
    );
  }

  public clear(): void {
    this.highPriorityQueue = [];
    this.normalPriorityQueue = [];
    this.lowPriorityQueue = [];
    this.pendingFiles.clear();
  }
}
