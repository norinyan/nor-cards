(async()=>{
const check=(v,label)=>{if(!v)throw Error(label);};
const wait=()=>new Promise(r=>setTimeout(r,120));
const path=`D13 Check ${Date.now()}.md`,note=await app.vault.create(path,'# Test\n\n');
const leaf=app.workspace.getLeaf(false);
try{
await leaf.openFile(note);await leaf.setViewState({type:'markdown',state:{file:path,mode:'source',source:false}});
const outer=leaf.view.editor;outer.setCursor({line:2,ch:0});app.commands.commands['nor-cards:insert-nor-card'].editorCallback(outer);await wait();
const root=[...document.querySelectorAll('.nor-card-shell')].find(e=>e.isShown());
const body=root.querySelector('.cm-content').cmTile.view;
check(body.state.doc.toString()==='- [ ] '&&body.state.selection.main.head===6,'blank task caret');
const cb=root.querySelector('input[type=checkbox]').getBoundingClientRect(),caret=body.coordsAtPos(6);
check(caret.left-cb.right>=7,'caret gap from checkbox');
root.style.width='300px';
const long='- [ ] '+('长任务自动换行对齐文字列'.repeat(8));
body.dispatch({changes:{from:0,to:body.state.doc.length,insert:long+'\n- [ ] Second\n- [x] Earlier'}});await wait();
let previousTop=-1;const starts=[];
for(let pos=6;pos<=long.length;pos++){const c=body.coordsAtPos(pos);if(c&&c.top>previousTop+3){starts.push(c.left);previousTop=c.top;}}
check(starts.length>1&&Math.max(...starts)-Math.min(...starts)<2,'wrapped text must align with first line');
root.querySelector('input[type=checkbox]').click();await wait();
check(body.state.doc.toString().startsWith('- [ ] Second\n- [x] Earlier\n- [x] 长任务'),'completion reorders whole task');
check([...root.querySelectorAll('.nor-card-task-line')].every(line=>line.querySelector('input').checked===line.classList.contains('nor-card-task-done')),'reused checkbox DOM must match its new task');
root.querySelector('.nor-card-date').click();await wait();
const date=root.querySelector('.nor-card-calendar [aria-label="2026-10-12"]');
// Test a known month without depending on the system day.
if(!date)throw Error('Probe expects October 2026');
const before=body.state.doc.toString();date.click();await wait();
check(root.querySelector('.nor-card-date').textContent==='Oct 12, Mon'&&body.state.doc.toString()===before,'date only changes card label');
app.plugins.plugins['nor-cards'].refreshDates();check(root.querySelector('.nor-card-date').textContent==='Oct 12, Mon','pinned date survives refresh');
await leaf.setViewState({type:'markdown',state:{file:path,mode:'preview'}});await wait();
let read=[...document.querySelectorAll('[data-callout="nor-card"]')].find(e=>e.isShown());
check(read.querySelector('.nor-card-date').textContent==='Oct 12, Mon','pinned date survives reading view');
read.querySelector('input[type=checkbox]').click();await wait();
const saved=await app.vault.read(note);
check(saved.indexOf('- [x] Earlier')<saved.indexOf('- [x] Second'),'reading view also moves completed task to bottom');
return {result:'passed',caretGap:Math.round(caret.left-cb.right),wrappedLines:starts.length};
}finally{await leaf.openFile(app.vault.getAbstractFileByPath('Nor Cards Preview D1.3.md'));await app.vault.delete(note);}
})()
