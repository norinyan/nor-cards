(async()=>{
const check=(v,label)=>{if(!v)throw Error(label);},wait=()=>new Promise(r=>setTimeout(r,170));
const previous=app.workspace.getActiveFile(),leaf=app.workspace.getLeaf(false),path=`Card Boundary Check ${Date.now()}.md`;
const one='> [!nor-card|white-standard-boundary-one]+ Nor Card\n> - [ ] First',two='> [!nor-card|green-standard-boundary-two]+ Nor Card\n> - [ ] Second';
const note=await app.vault.create(path,one+'\n\nBetween cards\n\n'+two+'\n');
try{
await leaf.openFile(note);await leaf.setViewState({type:'markdown',state:{file:path,mode:'source',source:false}});await wait();
const root=()=>[...document.querySelectorAll('.nor-card-shell[data-nor-id="boundary-one"]')].find(e=>e.isShown());
const outer=root().parentElement.cmTile.view,content=outer.contentDOM;
// Removing the structural blank must not let native callout rendering swallow prose.
let text=outer.state.doc.toString(),position=text.indexOf('\n\nBetween');
outer.dispatch({changes:{from:position,to:position+1,insert:''}});await wait();
check(outer.state.doc.toString()===text,'structural blank restored without changing text');
check([...content.children].some(e=>e.classList.contains('cm-line')&&e.textContent==='Between cards'),'between-card paragraph remains an outer editable line');
check(!content.querySelector(':scope > .cm-callout'),'no overlapping native callout');
// When both cards touch, the scanner must retain both identities before repair.
outer.dispatch({changes:{from:0,to:outer.state.doc.length,insert:one+'\n'+two+'\n'}});await wait();
check(content.querySelectorAll(':scope > .nor-card-shell').length===2,'adjacent cards remain separate');
check(outer.state.doc.toString()===one+'\n\n'+two+'\n','adjacent headers get a separator');
// Typing directly after the first card creates an external paragraph, not a lazy continuation.
position=outer.state.doc.toString().indexOf('\n\n');
outer.dispatch({changes:{from:position+1,to:position+2,insert:'New paragraph\n'}});await wait();
check([...content.children].some(e=>e.classList.contains('cm-line')&&e.textContent==='New paragraph'),'new text remains visible outside card');
check(content.querySelectorAll(':scope > .nor-card-shell').length===2,'both cards stay visible while typing');
const body=root().querySelector('.cm-content').cmTile.view;body.dispatch({changes:{from:body.state.doc.length,insert:'\n- [ ] Added task'}});await wait();
check(outer.state.doc.toString().includes('> - [ ] Added task')&&outer.state.doc.toString().includes('New paragraph'),'inner edit preserves external paragraph');
await leaf.view.save();const saved=await app.vault.read(note);
await leaf.setViewState({type:'markdown',state:{file:path,mode:'preview'}});await wait();await leaf.setViewState({type:'markdown',state:{file:path,mode:'source',source:false}});await wait();
check(leaf.view.editor.getValue()===saved,'save/reopen preserves all content');
check(root().parentElement.querySelectorAll(':scope > .nor-card-shell').length===2,'two cards after reopen');
return {result:'passed',scope:'separator deletion, adjacent cards, typing between cards, inner editing and save/reopen'};
}finally{if(previous)await leaf.openFile(previous);else await leaf.setViewState({type:'empty'});await app.vault.delete(note);}
})()
