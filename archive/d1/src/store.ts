import {apply, parse, type Action, type Task} from './model';
export interface TaskFile { path: string }
export interface TaskVault {
  getAbstractFileByPath(path:string): unknown;
  create(path:string,content:string): Promise<unknown>;
  read(file:TaskFile): Promise<string>;
  process(file:TaskFile,fn:(content:string)=>string): Promise<string>;
}
export class TaskStore {
  private queue: Promise<unknown> = Promise.resolve();
  constructor(private vault:TaskVault, private isFile:(value:unknown)=>value is TaskFile) {}
  private file(): TaskFile | null {
    const entry = this.vault.getAbstractFileByPath('Tasks.md');
    if (!entry) return null;
    if (!this.isFile(entry)) throw new Error('根目录 Tasks.md 不是文件。');
    return entry;
  }
  async read(): Promise<Task[]> {
    const file = this.file();
    return file ? parse(await this.vault.read(file)) : [];
  }
  mutate(action:Action): Promise<void> {
    const work = this.queue.then(async () => {
      let file = this.file();
      if (!file) {
        // Validate before creating. A competing creator may win; re-read instead of overwriting.
        if (action.type !== 'add') throw new Error('Tasks.md 已不存在。');
        apply('',action);
        try { await this.vault.create('Tasks.md',''); }
        catch (error) { if (!this.file()) throw error; }
        file = this.file();
      }
      if (!file) throw new Error('无法创建 Tasks.md。');
      await this.vault.process(file, content => apply(content,action));
    });
    this.queue = work.catch(() => {});
    return work;
  }
}
