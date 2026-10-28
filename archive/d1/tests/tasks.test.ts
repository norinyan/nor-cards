import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {apply,parse,visible,validDate,localDate, type Task} from '../src/model';
import {TaskStore, type TaskFile, type TaskVault} from '../src/store';
const task = (id='one',date='2026-10-27'):Task => ({id,text:'测试 **任务** <script>alert(1)</script>',date,created:'2026-10-28T02:00:00.000Z',completed:null});
test('CRUD preserves unrelated content byte for byte, including CRLF',() => {
  const original = '# My tasks\r\n\r\n- [ ] Existing task\r\nOther content without newline';
  const added = apply(original,{type:'add',task:task()});
  assert.ok(added.startsWith(original+'\r\n'));
  const edited = apply(added,{type:'edit',id:'one',text:'new\ntext'});
  assert.equal(parse(edited)[0]!.text,'new text');
  const completed = apply(edited,{type:'complete',id:'one',completed:'2026-10-28'});
  assert.equal(parse(completed)[0]!.date,'2026-10-27');
  assert.equal(parse(completed)[0]!.created,task().created);
  assert.equal(parse(completed)[0]!.completed,'2026-10-28');
  assert.equal(parse(apply(completed,{type:'complete',id:'one',completed:null}))[0]!.completed,null);
  assert.equal(apply(completed,{type:'delete',id:'one'}),original+'\r\n');
});
test('selected day filters overdue tasks and actual completion attribution without mutating',() => {
  const tasks = [task(),task('future','2026-10-29'),{...task('done'),completed:'2026-10-28'}];
  const before = JSON.stringify(tasks);
  assert.deepEqual(visible(tasks,'2026-10-28').todo.map(t=>t.id),['one']);
  assert.deepEqual(visible(tasks,'2026-10-28').completed.map(t=>t.id),['done']);
  assert.equal(visible(tasks,'2026-10-26').todo.length,0);
  assert.equal(JSON.stringify(tasks),before);
});
test('corrupt metadata, duplicate IDs and native checkbox mismatch fail closed',() => {
  const content = apply('',{type:'add',task:task()});
  for(const bad of [content+content,content.replace('[ ]','[x]'),content.replace('2026-10-27','2026-02-30'),'- [ ] bad <!-- norin-task:{bad} -->']) {
    assert.throws(()=>apply(bad,{type:'add',task:task('two')}));
  }
  assert.throws(()=>apply(content,{type:'edit',id:'one',text:' '}));
  assert.throws(()=>apply(content,{type:'edit',id:'one',text:'<!-- norin-task:reserved -->'}));
  assert.throws(()=>apply(content,{type:'delete',id:'missing'}));
  assert.equal(apply(content,{type:'add',task:task()}),content);
});
test('code examples are ignored, dates validated, text stays single-line',() => {
  const example = '```markdown\n'+apply('',{type:'add',task:task()})+'```\n';
  assert.equal(parse(example).length,0);
  assert.equal(parse(apply(example,{type:'add',task:task('real')})).length,1);
  assert.throws(()=>apply('```markdown\nexample\n',{type:'add',task:task()}));
  assert.equal(validDate('2024-02-29'),true);
  assert.equal(validDate('2026-02-29'),false);
  assert.equal(localDate(new Date(2026,9,28,0,1)),'2026-10-28');
});
class FakeVault implements TaskVault {
  entry:TaskFile|null = null;
  data = '';
  active = 0;
  maxActive = 0;
  fail = false;
  getAbstractFileByPath():unknown {return this.entry;}
  async create():Promise<void> {if(this.entry) throw Error('exists');this.entry={path:'Tasks.md'};}
  async read():Promise<string> {return this.data;}
  async process(_file:TaskFile,fn:(s:string)=>string):Promise<string> {
    this.maxActive=Math.max(this.maxActive,++this.active);
    try {await new Promise(resolve=>setTimeout(resolve,1));if(this.fail) {this.fail=false;throw Error('disk');}this.data=fn(this.data);return this.data;}finally{this.active--;}
  }
}
const isFile = (v:unknown):v is TaskFile => !!v && typeof v==='object' && 'path' in v;
test('shared store serializes rapid adds; errors do not poison queue; latest content retained',async () => {
  const vault = new FakeVault();const store = new TaskStore(vault,isFile);
  assert.deepEqual(await store.read(),[]);assert.equal(vault.entry,null);
  await Promise.all(Array.from({length:40},(_,i)=>store.mutate({type:'add',task:task('id-'+i)})));
  assert.equal((await store.read()).length,40);assert.equal(vault.maxActive,1);
  vault.data = '# Sync edit\n'+vault.data;
  vault.fail=true;
  await assert.rejects(store.mutate({type:'edit',id:'id-0',text:'failed'}));
  await store.mutate({type:'edit',id:'id-1',text:'success'});
  assert.ok(vault.data.startsWith('# Sync edit\n'));
  assert.equal((await store.read()).find(t=>t.id==='id-1')!.text,'success');
});
test('competing file creation reads winner; folders and deleted tasks cannot be overwritten',async () => {
  const vault = new FakeVault();
  vault.create=async()=>{vault.entry={path:'Tasks.md'};vault.data='# Winner\n';throw Error('exists');};
  const store = new TaskStore(vault,isFile);
  await store.mutate({type:'add',task:task()});assert.ok(vault.data.startsWith('# Winner\n'));
  vault.entry=null;
  await assert.rejects(store.mutate({type:'edit',id:'one',text:'no'}));
  const folderStore = new TaskStore({ ...vault,getAbstractFileByPath:()=>({folder:true}) } as unknown as TaskVault,isFile);
  await assert.rejects(folderStore.read());
});
test('independent filesystem vault roundtrip and no other notes changed',async () => {
  const root = await mkdtemp(join(tmpdir(),'norin-tasks-vault-'));
  try {
    const original='# Existing tasks\n\n- [ ] Keep this\n';
    await writeFile(join(root,'Tasks.md'),original);await writeFile(join(root,'Other.md'),'untouched');
    const file={path:'Tasks.md'};
    const vault:TaskVault={getAbstractFileByPath:()=>file,create:async()=>{throw Error('exists');},read:()=>readFile(join(root,'Tasks.md'),'utf8'),process:async(_,fn)=>{const next=fn(await readFile(join(root,'Tasks.md'),'utf8'));await writeFile(join(root,'Tasks.md'),next);return next;}};
    const store=new TaskStore(vault,isFile);
    await Promise.all(['a','b','c'].map(id=>store.mutate({type:'add',task:task(id)})));
    await store.mutate({type:'complete',id:'b',completed:'2026-10-28'});
    assert.equal((await store.read()).length,3);
    assert.ok((await readFile(join(root,'Tasks.md'),'utf8')).startsWith(original));
    assert.equal(await readFile(join(root,'Other.md'),'utf8'),'untouched');
  } finally {await rm(root,{recursive:true,force:true});}
});
