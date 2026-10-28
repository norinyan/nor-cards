(async()=>{
const results=[],check=(v,label)=>{if(!v)throw Error(label);results.push(label);};
const wait=()=>new Promise(r=>setTimeout(r,140));
const path=`Nor Cards D12 Check ${Date.now()}.md`;
const originalTasks=await app.vault.read(app.vault.getAbstractFileByPath('Tasks.md'));
const text='# Outside\n\n> [!nor-card|white-large-ui-first]+ Nor Card\n> ### To Do\n> - [ ] First task\n> - [ ] Second task\n> \n> ### Completed\n> - [x] Done\n\n> [!nor-card|green-small-ui-second]+ Nor Card\n> Independent\n\nOutside end\n';
const note=await app.vault.create(path,text),leaf=app.workspace.getLeaf(false);
const shell=()=>[...document.querySelectorAll('.nor-card-shell')].find(e=>e.isShown()&&e.dataset.norId==='ui-first');
const inner=()=>shell().querySelector('.cm-content').cmTile.view;
const outer=()=>leaf.view.editor;
const key=(value,extra={})=>inner().contentDOM.dispatchEvent(new KeyboardEvent('keydown',{key:value,code:value==='Enter'?'Enter':value,bubbles:true,cancelable:true,...extra}));
const theme=app.vault.getConfig('theme');
try {
await leaf.openFile(note);await leaf.setViewState({type:'markdown',state:{file:path,mode:'source',source:false}});await wait();
check(!!shell(),'fixed shell renders in Live Preview');
const root=shell(),header=root.querySelector('.nor-card-header');
inner().focus();inner().dispatch({selection:{anchor:inner().state.doc.line(2).to}});
check(shell()===root&&root.querySelector('.nor-card-header')===header,'body focus keeps exact same shell and header');
check(!root.querySelector('.nor-card-header [contenteditable]'),'header has no editable content');
check(!root.textContent.includes('[!nor-card')&&!root.textContent.includes('###'),'structural markers remain hidden');
key('Enter');check(outer().getValue().includes('> - [ ] First task\n> - [ ] \n'),'Enter continues task in card');
key('Enter');check(inner().state.doc.line(3).text==='','empty task Enter exits list inside body');
inner().dispatch({changes:{from:inner().state.doc.line(3).from,insert:'中文 **文字**'}});
check(shell()===root&&outer().getValue().includes('> 中文 **文字**'),'typing preserves shell and saves only body');
key('z',{code:'KeyZ',ctrlKey:true});check(!inner().state.doc.toString().includes('中文'),'inner undo works');
key('z',{code:'KeyZ',ctrlKey:true,shiftKey:true});check(inner().state.doc.toString().includes('中文'),'inner redo works');
// Multiline selection is entirely within the independent body editor.
await new Promise(r=>setTimeout(r,650));
const before=inner().state.doc.toString();
inner().dispatch({selection:{anchor:inner().state.doc.line(1).from,head:inner().state.doc.line(3).to}});
inner().dispatch(inner().state.replaceSelection('跨行替换'));
check(outer().getValue().includes('> 跨行替换')&&outer().getValue().includes('[!nor-card|white-large-ui-first]'),'cross-line replacement cannot edit shell metadata');
key('z',{code:'KeyZ',ctrlKey:true});check(inner().state.doc.toString()===before,'undo restores multiline body');
const selection=inner().state.selection.main.head,body=inner().state.doc.toString();
for(const color of ['green','black','white']) {
root.querySelector('[aria-label="切换卡片颜色"]').click();await wait();
check(root.dataset.norColor===color,`single click cycles to ${color}`);
check(shell()===root&&root.querySelector('.nor-card-header')===header,'color keeps same shell and header');
}
check(inner().state.selection.main.head===selection&&inner().state.doc.toString()===body,'color preserves body and caret');
check(![...document.querySelectorAll('.menu')].some(e=>e.isShown()),'color has no popup menu');
check(!root.querySelector('[title]'),'no hover hints on card controls');
check(!root.dataset.norSize&&!root.querySelector('select'),'no font-size controls or effects');
check(document.querySelector('[data-nor-id="ui-second"]').dataset.norColor==='green','other card remains independent');
const done=root.querySelector('input[aria-label="重新打开任务"]');done.click();await wait();
check(outer().getValue().includes('> - [ ] Done'),'checkbox edits in place');
root.querySelector('[aria-label="折叠卡片"]').click();await wait();
check(root.querySelector('.nor-card-body').hidden&&outer().getValue().includes('ui-first]-'),'fold persists without replacing shell');
root.querySelector('[aria-label="展开卡片"]').click();await wait();check(!root.querySelector('.nor-card-body').hidden,'unfold restores same editor');
for(const mode of ['obsidian','moonstone']){app.vault.setConfig('theme',mode);app.setTheme();await wait();root.style.width='300px';check(root.scrollWidth<=root.clientWidth,`${mode} 300px no overflow`);root.style.width='';}
// Insert a fresh blank card through the actual command and verify body focus.
outer().setCursor({line:outer().lastLine(),ch:outer().getLine(outer().lastLine()).length});
app.commands.commands['nor-cards:insert-nor-card'].editorCallback(outer());await wait();
const fresh=[...document.querySelectorAll('.nor-card-shell')].find(e=>e.isShown()&&!['ui-first','ui-second'].includes(e.dataset.norId));
check(fresh&&fresh.querySelector('.cm-content').cmTile.view.hasFocus&&fresh.querySelector('.cm-content').cmTile.view.state.doc.toString()==='', 'insert command focuses blank independent body');
// External source change while focused: do not overwrite the local draft.
inner().focus();const bodyBeforeConflict=inner().state.doc.toString();
const lines=outer().getValue().split('\n'),index=lines.findIndex(l=>l==='> ### To Do');
outer().replaceRange('> External edit',{line:index,ch:0},{line:index,ch:lines[index].length});await wait();
check(root.querySelector('.nor-card-error').textContent.includes('外部更新'),'external edit conflict is visible');
inner().dispatch({changes:{from:inner().state.doc.length,insert:'本地草稿'}});
check(inner().state.doc.toString()===bodyBeforeConflict+'本地草稿'&&!outer().getValue().includes('本地草稿'),'conflict preserves local draft without overwriting external body');
check(outer().getValue().includes('Outside end'),'unrelated prose retained');
await leaf.setViewState({type:'markdown',state:{file:path,mode:'source',source:true}});await wait();
check(!shell()&&outer().getValue().includes('[!nor-card'),'source mode remains available');
await leaf.setViewState({type:'markdown',state:{file:path,mode:'preview'}});await wait();
const read=[...document.querySelectorAll('[data-callout="nor-card"]')].find(e=>e.isShown());
check(read&&read.querySelector('.nor-card-header'),'reading view remains a card');
read.querySelector('[aria-label="卡片外观"]').click();await wait();
check(read.dataset.norColor==='green','reading view color also cycles directly');
check((await app.vault.read(app.vault.getAbstractFileByPath('Tasks.md')))===originalTasks,'legacy Tasks.md unchanged byte-for-byte');
return {count:results.length,results};
} finally {app.vault.setConfig('theme',theme);app.setTheme();await leaf.openFile(app.vault.getAbstractFileByPath('Nor Cards Preview D1.2.md'));await app.vault.delete(note);}
})()
