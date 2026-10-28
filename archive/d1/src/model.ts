export interface Task {
  id: string;
  text: string;
  date: string;
  created: string;
  completed: string | null;
}
interface Row { task: Task; start: number; end: number }
export function validDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T12:00:00Z`);
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}
export function localDate(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
export function cleanText(text: string): string {
  const result = text.replace(/[\r\n]+/g, ' ').trim();
  if (!result || result.includes('<!-- norin-task:')) throw new Error('任务不能为空，也不能包含保留的任务标记。');
  return result;
}
export function rows(content: string): Row[] {
  const result: Row[] = [];
  const ids = new Set<string>();
  const lines = /[^\r\n]+/g;
  let match: RegExpExecArray | null;
  let fence: { char: string; length: number } | null = null;
  while ((match = lines.exec(content))) {
    const line = match[0];
    const f = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if (f) {
      if (!fence) fence = {char:f[1]![0]!, length:f[1]!.length};
      else if (f[1]![0] === fence.char && f[1]!.length >= fence.length && !f[2]!.trim()) fence = null;
      continue;
    }
    if (fence || !line.includes('<!-- norin-task:')) continue;
    const parsed = /^- \[([ xX])\] (.+) <!-- norin-task:(\{.*\}) -->$/.exec(line);
    if (!parsed) throw new Error('Tasks.md 中有损坏的 Norin Tasks 标记，请先修复该行；文件未被修改。');
    let meta: Omit<Task,'text'>;
    try { meta = JSON.parse(parsed[3]!); } catch { throw new Error('任务元数据不是有效 JSON；文件未被修改。'); }
    if (!meta || typeof meta.id !== 'string' || !/^[\w-]+$/.test(meta.id) || !validDate(meta.date) ||
        typeof meta.created !== 'string' || isNaN(Date.parse(meta.created)) ||
        !(meta.completed === null || validDate(meta.completed)) ||
        (parsed[1]!.toLowerCase() === 'x') !== (meta.completed !== null) || ids.has(meta.id)) {
      throw new Error('任务日期、勾选状态或 ID 有冲突，请先修复 Tasks.md；文件未被修改。');
    }
    ids.add(meta.id);
    result.push({task:{...meta,text:parsed[2]!}, start:match.index, end:match.index+line.length});
  }
  return result;
}
export function parse(content: string): Task[] { return rows(content).map(row => row.task); }
function serialize(task: Task): string {
  const {text,...meta} = task;
  return `- [${task.completed ? 'x' : ' '}] ${cleanText(text)} <!-- norin-task:${JSON.stringify(meta)} -->`;
}
export type Action = {type:'add'; task:Task} | {type:'edit'; id:string; text:string} |
  {type:'complete'; id:string; completed:string|null} | {type:'delete'; id:string};
export function apply(content: string, action: Action): string {
  const current = rows(content);
  if (action.type === 'add') {
    if (current.some(row => row.task.id === action.task.id)) return content;
    const eol = content.includes('\r\n') ? '\r\n' : '\n';
    const line = serialize(action.task);
    parse(line); // Validate before any write.
    const next = content + (content && !content.endsWith('\n') ? eol : '') + line + eol;
    if (!parse(next).some(task => task.id === action.task.id)) {
      throw new Error('Tasks.md 末尾存在未闭合的代码块，无法安全追加任务；文件未被修改。');
    }
    return next;
  }
  const row = current.find(row => row.task.id === action.id);
  if (!row) throw new Error('该任务已被删除，请刷新后重试。');
  let replacement = '';
  if (action.type === 'edit') replacement = serialize({...row.task,text:cleanText(action.text)});
  if (action.type === 'complete') {
    if (action.completed !== null && !validDate(action.completed)) throw new Error('无效完成日期。');
    replacement = serialize({...row.task,completed:action.completed});
  }
  // Remove only our row, keeping all unrelated bytes untouched.
  const end = action.type === 'delete' ? row.end + (content.slice(row.end).startsWith('\r\n') ? 2 : content[row.end] === '\n' ? 1 : 0) : row.end;
  return content.slice(0,row.start) + replacement + content.slice(end);
}
export function visible(tasks: Task[], day: string): {todo:Task[]; completed:Task[]} {
  return {todo:tasks.filter(t => !t.completed && t.date <= day), completed:tasks.filter(t => t.completed === day)};
}
