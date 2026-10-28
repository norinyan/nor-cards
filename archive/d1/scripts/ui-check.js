(async()=>{
const results=[];
const check=(condition,label)=>{if(!condition)throw Error(label);results.push(label);};
const wait=()=>new Promise(r=>setTimeout(r,220));
const plugin=()=>app.plugins.plugins['norin-tasks'];
const panels=()=>[...plugin().panels].filter(p=>p.containerEl.isShown());
const first=()=>panels()[0].containerEl;
const second=()=>panels()[1].containerEl;
const dateKey=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const today=new Date();const day=dateKey(today);const yesterday=new Date(today);yesterday.setDate(today.getDate()-1);
const testPath=`Norin UI Check ${Date.now()}.md`;
const note=await app.vault.create(testPath,'# UI verification\n\n```norin-tasks\n```\n\n```norin-tasks\ntodo: 今天要做\ncompleted: 已经完成\nbackground: green\n```\n');
const leaf=app.workspace.getLeaf(false);
const taskFile=app.vault.getAbstractFileByPath('Tasks.md');
const original=taskFile ? await app.vault.read(taskFile) : '';
const theme=app.vault.getConfig('theme');
const setTheme=mode=>{app.vault.setConfig('theme',mode);app.setTheme();};
const idsBefore=new Set((await plugin().store.read()).map(t=>t.id));
try {
await leaf.openFile(note);
await leaf.setViewState({type:'markdown',state:{file:testPath,mode:'preview'}});await wait();
check(panels().length===2,'two rendered reading-view blocks');
check(first().querySelector('.norin-tasks-section-title').textContent==='待办','empty block uses default Chinese titles');
check(second().querySelector('.norin-tasks-section-title').textContent==='今天要做' && second().dataset.background==='green','per-block title and background config');
check(first().querySelector('.norin-tasks-day').textContent===today.toLocaleDateString('en-US',{weekday:'long'}),'date and weekday have separate elements');
check(first().querySelector('hr.norin-tasks-divider'),'divider rendered');
const initialTasks=await plugin().store.read();
const initialRows=first().querySelectorAll('.norin-tasks-row').length;
first().querySelector('.norin-tasks-collapse').click();await wait();
check(first().querySelector('.norin-tasks-content').hidden && !second().querySelector('.norin-tasks-content').hidden,'collapse is independent per block');
check(await app.vault.read(taskFile)===original,'collapse does not write Tasks.md');
await app.plugins.disablePlugin('norin-tasks');await app.plugins.enablePlugin('norin-tasks');await wait();
check(first().querySelector('.norin-tasks-content').hidden && !second().querySelector('.norin-tasks-content').hidden,'collapse memory survives plugin reload independently');
first().querySelector('.norin-tasks-date').click();
check(first().querySelector('.norin-tasks-calendar'),'date opens calendar while collapsed');
first().querySelector('.norin-tasks-collapse').click();
first().querySelector('.norin-tasks-add').click();
first().querySelector('form input').value='UI task <img src=x onerror=alert(1)>';
check(first().querySelector('.norin-tasks-date').disabled && first().querySelector('.norin-tasks-collapse').disabled,'navigation disabled while editing');
plugin().refresh();await wait();
check(first().querySelector('form input').value.includes('UI task'),'refresh preserves input draft');
first().querySelector('form').requestSubmit();await wait();
check(panels().every(p=>p.containerEl.querySelectorAll('.norin-tasks-row').length===initialRows+1),'add propagates without duplicate');
check(!first().querySelector('img'),'HTML text cannot inject DOM');
const row=()=>[...first().querySelectorAll('.norin-tasks-row')].find(r=>r.textContent.includes('UI task') || r.textContent.includes('UI edited'));
row().querySelector('input[type=checkbox]').click();await wait();
check(row().classList.contains('is-completed'),'complete moves task to Completed');
row().querySelector('[aria-label="编辑任务"]').click();first().querySelector('form input').value='UI edited';
first().querySelector('form').requestSubmit();await wait();
check(panels().every(p=>p.containerEl.innerText.includes('UI edited')),'edit propagates');
first().querySelector('.norin-tasks-date').click();
if(yesterday.getMonth()!==today.getMonth()) first().querySelector('[aria-label="上个月"]').click();
first().querySelector(`[aria-label="${dateKey(yesterday)}"]`).click();await wait();
check(!first().innerText.includes('UI edited'),'historical view excludes another completion day');
const beforeSwitch=await app.vault.read(taskFile);
first().querySelector('.norin-tasks-date').click();
if(yesterday.getMonth()!==today.getMonth()) first().querySelector('[aria-label="下个月"]').click();
first().querySelector(`[aria-label="${day}"]`).click();
check(await app.vault.read(taskFile)===beforeSwitch,'date switch never writes task data');
row().querySelector('input[type=checkbox]').click();await wait();
check(!row().classList.contains('is-completed'),'uncheck reopens task');
row().querySelector('[aria-label="删除任务"]').click();first().querySelector('form').requestSubmit();await wait();
check((await app.vault.read(taskFile))===original,'delete restores pre-test Tasks.md including existing tasks');
// Verify actual layout and contrast in both themes at narrow and wide sizes.
const metrics=[];
for(const mode of ['obsidian','moonstone']) {
setTheme(mode);await wait();
for(const width of [300,600]) {
first().style.width=`${width}px`;
const card=first().getBoundingClientRect();
const week=first().querySelector('.norin-tasks-day').getBoundingClientRect();
const title=first().querySelector('.norin-tasks-section-title');
const bg=getComputedStyle(second()).backgroundColor;
check(Math.abs((week.left+week.width/2)-(card.left+card.width/2))<2,`${mode} ${width}px weekday centered`);
check(first().scrollWidth<=first().clientWidth,`${mode} ${width}px no horizontal overflow`);
check(document.body.classList.contains(mode==='obsidian' ? 'theme-dark' : 'theme-light'),`${mode} theme applied`);
metrics.push({theme:mode,width,titleFont:getComputedStyle(title).fontSize,background:bg});
}
}
first().style.width='';setTheme(theme);
await leaf.setViewState({type:'markdown',state:{file:testPath,mode:'source',source:false}});await wait();
leaf.view.editor.setCursor({line:0,ch:0});await wait();
check(document.querySelectorAll('.markdown-source-view.is-live-preview .norin-tasks').length>=2,'Live Preview renders both cards');
first().querySelector('.norin-tasks-collapse').click();
await leaf.setViewState({type:'markdown',state:{file:testPath,mode:'preview'}});await wait();
check(first().querySelector('.norin-tasks-content').hidden && !second().querySelector('.norin-tasks-content').hidden,'fold state shared between Live Preview and reading view for same block');
const cmd=app.commands.commands['norin-tasks:insert-norin-tasks'];let inserted='';
cmd.editorCallback({getCursor:()=>({line:0,ch:0}),getLine:()=>'',replaceSelection:s=>{inserted=s;}});
check(inserted==='```norin-tasks\n```\n','insert command remains compatible');
return {results,metrics,existingTasks:initialTasks.length};
} finally {
setTheme(theme);
// Remove only tasks created by this test, never reset the entire task file.
for(const task of await plugin().store.read()) if(!idsBefore.has(task.id) && /^UI (task|edited)/.test(task.text)) await plugin().store.mutate({type:'delete',id:task.id});
await leaf.openFile(app.vault.getAbstractFileByPath('Panel.md'));
await app.vault.delete(note);
}
})()
