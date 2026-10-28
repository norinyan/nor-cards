(async()=>{
const check=(v,label)=>{if(!v)throw Error(label);};
const wait=(ms=150)=>new Promise(r=>setTimeout(r,ms));
const previous=app.workspace.getActiveFile(),leaf=app.workspace.getLeaf(false);
const path=`Drag Check ${Date.now()}.md`;
const note=await app.vault.create(path,'Before\n\n> [!nor-card|green-standard-drag-check]+ Nor Card <!-- nor-date:2026-10-12 -->\n> - [ ] First\n>   details\n> - [ ] Second\n> - [ ] Third\n> - [x] Done A\n> - [x] Done B\n\nAfter\n');
let saved;
try{
await leaf.openFile(note);await leaf.setViewState({type:'markdown',state:{file:path,mode:'source',source:false}});await wait();
const get=()=>{const root=[...document.querySelectorAll('.nor-card-shell')].find(e=>e.isShown()&&e.querySelector('.nor-card-drag-handle'));check(root,'drag handles rendered');return {root,body:root.querySelector('.cm-content').cmTile.view};};
let {root,body}=get();
const drag=(from,target,after=true,commit=true)=>{
 const rows=[...body.contentDOM.querySelectorAll('.nor-card-task-line')];
 const handle=rows[from].querySelector('.nor-card-drag-handle'),rect=rows[target].getBoundingClientRect(),dt=new DataTransfer();
 const before=body.state.doc.toString();
 handle.dispatchEvent(new DragEvent('dragstart',{bubbles:true,cancelable:true,dataTransfer:dt}));
 check(root.classList.contains('nor-card-sorting'),'drag session starts');
 body.contentDOM.dispatchEvent(new DragEvent('dragover',{bubbles:true,cancelable:true,dataTransfer:dt,clientY:rect.top+rect.height*(after?.8:.2)}));
 check(body.state.doc.toString()===before,'preview does not mutate data');
 if(commit)body.contentDOM.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:dt,clientY:rect.top+rect.height*(after?.8:.2)}));
 handle.dispatchEvent(new DragEvent('dragend',{bubbles:true,dataTransfer:dt}));
 check(!root.classList.contains('nor-card-sorting')&&!document.querySelector('.nor-card-drag-ghost'),'drag cleanup');
};
drag(0,2);await wait(230);
check(body.state.doc.toString()==='- [ ] Second\n- [ ] Third\n- [ ] First\n  details\n- [x] Done A\n- [x] Done B','whole task moves down');
drag(4,3,false);await wait(230);
check(body.state.doc.toString().endsWith('- [x] Done B\n- [x] Done A'),'completed group reorders');
const stable=body.state.doc.toString();drag(0,4);check(body.state.doc.toString()===stable,'cross completion group rejected');
drag(0,2,true,false);check(body.state.doc.toString()===stable,'cancel preserves order');
root.querySelector('input[type=checkbox]').click();await wait(230);
check(body.state.doc.toString().endsWith('- [x] Second'),'checkbox still moves correct task');
check([...root.querySelectorAll('.nor-card-task-line')].every(line=>line.querySelector('input').checked===line.classList.contains('nor-card-task-done')),'checkbox states match task data');
const expected=body.state.doc.toString();
await leaf.view.save();saved=await app.vault.read(note);
check(saved.startsWith('Before\n')&&saved.endsWith('\nAfter\n')&&saved.includes('<!-- nor-date:2026-10-12 -->'),'date and surrounding text preserved');
await leaf.setViewState({type:'markdown',state:{file:path,mode:'preview'}});await wait();
await leaf.setViewState({type:'markdown',state:{file:path,mode:'source',source:false}});await wait();
({root,body}=get());check(body.state.doc.toString()===expected,'saved order survives reopening');
return {result:'passed',scope:'drag preview/drop/cancel, multiline, completed group, cross-group rejection, checkbox regression, save/reopen and date preservation'};
}finally{
 if(previous)await leaf.openFile(previous);else await leaf.setViewState({type:'empty'});
 await app.vault.delete(note);
}
})()
