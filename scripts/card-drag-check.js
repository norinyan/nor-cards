(async()=>{
const check=(v,label)=>{if(!v)throw Error(label);};
const wait=(ms=170)=>new Promise(r=>setTimeout(r,ms));
const previous=app.workspace.getActiveFile(),leaf=app.workspace.getLeaf(false);
const path=`Card Drag Check ${Date.now()}.md`;
const card='> [!nor-card|black-standard-moving]- Nor Card <!-- nor-date:2026-10-12 -->\n> - [ ] First\n>   details\n> - [x] Done';
const original='Before\n\n'+card+'\n\nMiddle\n\n> [!nor-card|green-standard-staying]+ Nor Card\n> - [ ] Other\n\nAfter\n';
const note=await app.vault.create(path,original);
try{
await leaf.openFile(note);await leaf.setViewState({type:'markdown',state:{file:path,mode:'source',source:false}});await wait();
const getRoot=()=>[...document.querySelectorAll('.nor-card-shell[data-nor-id="moving"]')].find(e=>e.isShown());
let root=getRoot();check(root,'source card rendered');
const outer=root.parentElement.cmTile.view;
const drag=(target,commit=true)=>{
 root=getRoot();const handle=root.querySelector('.nor-card-move-handle'),dt=new DataTransfer(),before=outer.state.doc.toString();
 const coords=outer.coordsAtPos(target,1),rect=outer.contentDOM.getBoundingClientRect();
 handle.dispatchEvent(new DragEvent('dragstart',{bubbles:true,cancelable:true,dataTransfer:dt}));
 check(root.classList.contains('nor-card-whole-dragging'),'whole-card session started');
 outer.dom.dispatchEvent(new DragEvent('dragover',{bubbles:true,cancelable:true,dataTransfer:dt,clientX:rect.left+20,clientY:coords.top}));
 check(outer.state.doc.toString()===before,'drag preview preserves Markdown');
 check(document.querySelector('.nor-card-drop-line:not([hidden])'),'drop indicator visible');
 if(commit)outer.dom.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:dt,clientX:rect.left+20,clientY:coords.top}));
 handle.dispatchEvent(new DragEvent('dragend',{bubbles:true,dataTransfer:dt}));
 check(!document.querySelector('.nor-card-whole-ghost,.nor-card-drop-line'),'temporary drag UI cleaned');
};
drag(outer.state.doc.length,false);check(outer.state.doc.toString()===original,'cancel leaves note unchanged');
drag(outer.state.doc.length);await wait(240);
const moved=outer.state.doc.toString();
check(moved.endsWith(card+'\n')&&moved.includes('Middle\n\n> [!nor-card|green-standard-staying]'),'whole card moves below other content');
check(moved.split('black-standard-moving').length===2,'no duplicate card');
check(!getRoot().querySelector('.nor-card-error').textContent,'no conflict after move');
// Notebook undo/redo should move the entire card in one step.
outer.focus();leaf.view.editor.undo();await wait();check(outer.state.doc.toString()===original,'one undo restores complete note');
leaf.view.editor.redo();await wait();check(outer.state.doc.toString()===moved,'one redo restores move');
root=getRoot();root.querySelector('.nor-card-date').click();await wait();check(root.querySelector('.nor-card-calendar'),'date still opens calendar');root.querySelector('.nor-card-date').click();
root.querySelector('[aria-label="展开卡片"]').click();await wait();root=getRoot();
const body=root.querySelector('.cm-content').cmTile.view;
body.dispatch({changes:{from:body.state.doc.length,insert:'\n- [ ] Edited after move'}});await wait();
check(outer.state.doc.toString().includes('> - [ ] Edited after move'),'body remains editable after moving');
await leaf.view.save();const saved=await app.vault.read(note);check(saved.includes('nor-date:2026-10-12')&&saved.includes('Edited after move'),'date and body saved');
await leaf.setViewState({type:'markdown',state:{file:path,mode:'preview'}});await wait();
await leaf.setViewState({type:'markdown',state:{file:path,mode:'source',source:false}});await wait();
check(leaf.view.editor.getValue()===saved,'saved order survives reopening');
return {result:'passed',scope:'move/cancel, intact metadata and multiline body, one-step undo/redo, date and editing, save/reopen'};
}finally{if(previous)await leaf.openFile(previous);else await leaf.setViewState({type:'empty'});await app.vault.delete(note);}
})()
