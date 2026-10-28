// Actual Chromium pointer, keyboard and IME input in the isolated vault only.
const targets=await(await fetch('http://127.0.0.1:9333/json')).json();
const target=targets.find(t=>t.url==='app://obsidian.md/index.html'&&t.title.includes('.test-vault'));
if(!target)throw Error('Isolated test window missing');
const ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise(r=>ws.onopen=r);
let id=0;const pending=new Map();ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(m.error):p.resolve(m.result);}};
const call=(method,params)=>new Promise((resolve,reject)=>{pending.set(++id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
async function evaluate(expression){const r=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;}
const pause=()=>new Promise(r=>setTimeout(r,180));
const path=`Native Input ${Date.now()}.md`;
const click=async point=>{await call('Input.dispatchMouseEvent',{type:'mousePressed',x:point.x,y:point.y,button:'left',clickCount:1});await call('Input.dispatchMouseEvent',{type:'mouseReleased',x:point.x,y:point.y,button:'left',clickCount:1});await pause();};
const point=selector=>evaluate(`(()=>{const e=[...document.querySelectorAll(${JSON.stringify(selector)})].find(e=>e.isShown());e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
const results=[];let guarded=false;
try {
const vault=await evaluate('app.vault.adapter.basePath');if(vault!==new URL('../.test-vault',import.meta.url).pathname)throw Error('Wrong vault');guarded=true;
await evaluate(`(async()=>{const f=await app.vault.create(${JSON.stringify(path)},'# Test\\n\\n');const leaf=app.workspace.getLeaf(false);await leaf.openFile(f);await leaf.setViewState({type:'markdown',state:{file:f.path,mode:'source',source:false}});const e=leaf.view.editor;e.setValue(${JSON.stringify('# Test\n\n> [!nor-card|white-standard-native-input]+ Nor Card\n> \n> - [ ] Original\n')});e.setCursor({line:0,ch:0});return true;})()`);await pause();
await evaluate(`(()=>{window.norProbeShell=[...document.querySelectorAll('.nor-card-shell')].find(e=>e.isShown());window.norProbeHeader=window.norProbeShell.querySelector('.nor-card-header');window.norProbeBody=window.norProbeShell.querySelector('.cm-content').cmTile.view;})()`);
await click(await point('.nor-card-shell [aria-label="切换卡片颜色"]'));
if(!await evaluate('window.norProbeShell.dataset.norColor==="green"'))throw Error('Pointer did not cycle color');
results.push('real pointer cycles color without menu');
await click(await point('.nor-card-shell .cm-content'));
if(!await evaluate('window.norProbeBody.hasFocus'))throw Error('Body click did not focus independent editor');
results.push('single click focuses only card body');
await evaluate('(()=>{const e=window.norProbeBody;e.dispatch({selection:{anchor:e.state.doc.length}});e.focus();})()');
await call('Input.imeSetComposition',{text:'中文',selectionStart:2,selectionEnd:2});
await call('Input.insertText',{text:'中文'});
if(!await evaluate('window.norProbeBody.state.doc.toString().endsWith("Original中文")'))throw Error('IME composition did not commit correctly');
results.push('Chinese IME commits once in card body');
await call('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});await call('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
if(!await evaluate('window.norProbeBody.state.doc.line(3).text==="- [ ] "'))throw Error('Enter failed');
results.push('real Enter continues next task');
if(!await evaluate('window.norProbeShell===document.querySelector(".nor-card-shell")&&window.norProbeHeader===window.norProbeShell.querySelector(".nor-card-header")'))throw Error('Shell changed during real input');
results.push('same shell and header throughout pointer, IME and Enter');
await call('Input.insertText',{text:'Second'});
await call('Input.dispatchKeyEvent',{type:'keyDown',key:'z',code:'KeyZ',windowsVirtualKeyCode:90,modifiers:2});await call('Input.dispatchKeyEvent',{type:'keyUp',key:'z',code:'KeyZ',windowsVirtualKeyCode:90,modifiers:2});
if(await evaluate('window.norProbeBody.state.doc.toString().includes("Second")'))throw Error('Real undo failed');
results.push('real Ctrl+Z undoes body input');
console.log(JSON.stringify(results,null,2));
} finally {
try{if(guarded)await evaluate(`(async()=>{const leaf=app.workspace.getMostRecentLeaf();await leaf.openFile(app.vault.getAbstractFileByPath('Nor Cards Preview D1.2.md'));const f=app.vault.getAbstractFileByPath(${JSON.stringify(path)});if(f)await app.vault.delete(f);})()`);}finally{ws.close();}
}
