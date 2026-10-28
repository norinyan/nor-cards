import { MarkdownRenderChild, Notice, Plugin, TFile, setIcon } from 'obsidian';
import { cleanText, localDate, visible, type Action, type Task } from './model';
import { TaskStore, type TaskVault } from './store';
import { parseConfig, type PanelConfig } from './config';

export default class NorinTasks extends Plugin {
  store!: TaskStore;
  panels = new Set<TaskPanel>();
  async onload(): Promise<void> {
    this.store = new TaskStore(this.app.vault as unknown as TaskVault, (file):file is TFile => file instanceof TFile);
    this.registerMarkdownCodeBlockProcessor('norin-tasks', (source, el, ctx) => {
      const section = ctx.getSectionInfo(el);
      const key = JSON.stringify([ctx.sourcePath,section?.lineStart ?? 0]);
      ctx.addChild(new TaskPanel(el,this,parseConfig(source),key));
    });
    this.addCommand({id:'insert-norin-tasks',name:'Insert Norin Tasks',editorCallback: editor => {
      const cursor = editor.getCursor();
      const prefix = cursor.ch > 0 ? '\n' : '';
      const suffix = cursor.ch < editor.getLine(cursor.line).length ? '\n' : '';
      editor.replaceSelection(`${prefix}\`\`\`norin-tasks\n\`\`\`\n${suffix}`);
    }});
    const changed = (file: {path:string}) => { if (file.path === 'Tasks.md') this.refresh(); };
    this.registerEvent(this.app.vault.on('modify',changed));
    this.registerEvent(this.app.vault.on('create',changed));
    this.registerEvent(this.app.vault.on('delete',changed));
    this.registerEvent(this.app.vault.on('rename',(file,oldPath) => {
      if (file.path === 'Tasks.md' || oldPath === 'Tasks.md') this.refresh();
    }));
  }
  refresh(): void { for (const panel of this.panels) void panel.refresh(); }
}
class TaskPanel extends MarkdownRenderChild {
  private day = localDate();
  private month = this.day.slice(0,7);
  private calendarOpen = false;
  private collapsed = false;
  private tasks:Task[] = [];
  private version = 0;
  private alive = false;
  private busy = false;
  private error = '';
  private body!:HTMLElement;
  private status!:HTMLElement;
  constructor(el:HTMLElement,private plugin:NorinTasks,private config:PanelConfig,private stateKey:string) { super(el); }
  private syncCollapsed(key:string,collapsed:boolean):void {
    if (this.stateKey !== key || this.collapsed === collapsed) return;
    this.collapsed = collapsed;
    if (!this.editing) this.render();
  }
  private get editing():boolean { return !!this.containerEl.querySelector('form'); }
  private lockNavigation():void {
    for (const button of Array.from(this.containerEl.querySelectorAll<HTMLButtonElement>('.norin-tasks-topbar button, .norin-tasks-calendar button'))) button.disabled = true;
  }
  onload():void {
    this.alive = true;
    this.plugin.panels.add(this);
    this.containerEl.addClass('norin-tasks');
    this.containerEl.dataset.background = this.config.background;
    try { this.collapsed = this.plugin.app.loadLocalStorage('norin-tasks:collapsed:'+this.stateKey) === true; } catch { /* State memory is optional. */ }
    this.render();
    void this.refresh();
    // A panel left open overnight follows today only while it was showing today.
    let today = localDate();
    this.registerInterval(window.setInterval(() => {
      const next = localDate();
      if (today !== next && !this.editing && !this.busy) { if (this.day === today) { this.day = next; this.month = next.slice(0,7); this.render(); } today = next; }
    },60_000));
  }
  onunload():void { this.alive = false; this.version++; this.plugin.panels.delete(this); }
  async refresh():Promise<void> {
    const version = ++this.version;
    try {
      const tasks = await this.plugin.store.read();
      if (!this.alive || version !== this.version) return;
      this.tasks = tasks; this.error = '';
    } catch (error) {
      if (!this.alive || version !== this.version) return;
      this.error = message(error);
    }
    // Keep an active input intact during Sync or another panel's edits.
    if (this.containerEl.querySelector('form')) this.updateStatus();
    else this.render();
  }
  private updateStatus():void { this.status?.setText(this.error); }
  private button(parent:HTMLElement,label:string,icon:string,run:()=>void):HTMLButtonElement {
    const button = parent.createEl('button',{cls:'norin-tasks-icon',attr:{'aria-label':label,title:label,type:'button'}});
    setIcon(button,icon); button.onclick = run; return button;
  }
  private async change(action:Action):Promise<boolean> {
    if (this.busy) return false;
    this.busy = true; this.containerEl.setAttribute('aria-busy','true');
    try {
      await this.plugin.store.mutate(action);
      await this.refresh(); this.plugin.refresh(); return true;
    } catch (error) { new Notice(message(error)); return false; }
    finally { this.busy = false; this.containerEl.removeAttribute('aria-busy'); }
  }
  private render():void {
    this.containerEl.empty();
    this.containerEl.toggleClass('is-collapsed',this.collapsed);
    const header = this.containerEl.createDiv('norin-tasks-topbar');
    const date = new Date(`${this.day}T12:00:00`);
    const dateButton = header.createEl('button',{
      text:`${date.toLocaleDateString('en-US',{month:'short'})} ${date.getDate()}`,
      cls:'norin-tasks-date',attr:{type:'button','aria-label':'选择日期','aria-expanded':String(this.calendarOpen)}
    });
    dateButton.onclick = () => {
      if(this.editing || this.busy) return;
      this.calendarOpen = !this.calendarOpen;this.month = this.day.slice(0,7);this.render();
      this.containerEl.querySelector<HTMLButtonElement>('.norin-tasks-date')?.focus();
    };
    header.createSpan({text:date.toLocaleDateString('en-US',{weekday:'long'}),cls:'norin-tasks-day'});
    const toggle = this.button(header,this.collapsed ? '展开任务' : '折叠任务',this.collapsed ? 'chevron-down' : 'chevron-up',() => {
      if(this.editing || this.busy) return;
      this.collapsed = !this.collapsed;this.calendarOpen = false;
      try {this.plugin.app.saveLocalStorage('norin-tasks:collapsed:'+this.stateKey,this.collapsed);} catch { /* Do not block task usage. */ }
      for (const panel of this.plugin.panels) panel.syncCollapsed(this.stateKey,this.collapsed);
      this.render();this.containerEl.querySelector<HTMLButtonElement>('.norin-tasks-collapse')?.focus();
    });
    toggle.addClass('norin-tasks-collapse');
    toggle.setAttribute('aria-expanded',String(!this.collapsed));
    if (this.calendarOpen) this.calendar();
    this.status = this.containerEl.createDiv({cls:'norin-tasks-error',attr:{role:'status','aria-live':'polite'}});
    this.updateStatus();
    const content = this.containerEl.createDiv('norin-tasks-content');
    content.hidden = this.collapsed;
    content.createEl('hr',{cls:'norin-tasks-divider'});
    this.body = content.createDiv();
    const filtered = visible(this.tasks,this.day);
    this.section(this.config.todo,filtered.todo);
    const add = this.body.createEl('button',{text:'+ 添加任务',cls:'norin-tasks-add',attr:{type:'button'}});
    add.disabled = !!this.error;
    add.onclick = () => { if (!this.busy) this.editor(add); };
    this.section(this.config.completed,filtered.completed);
  }
  private section(title:string,tasks:Task[]):void {
    this.body.createEl('h3',{text:title,cls:'norin-tasks-section-title'});
    const list = this.body.createDiv('norin-tasks-list');
    if (!tasks.length) list.createDiv({cls:'norin-tasks-empty',text:'—'});
    for (const task of tasks) {
      const row = list.createDiv('norin-tasks-row');
      if (task.completed) row.addClass('is-completed');
      const checkbox = row.createEl('input',{type:'checkbox',attr:{'aria-label':task.completed ? `重新打开：${task.text}` : `完成：${task.text}`}});
      checkbox.checked = !!task.completed; checkbox.disabled = !!this.error;
      checkbox.onchange = () => {
        checkbox.disabled = true;
        void this.change({type:'complete',id:task.id,completed:checkbox.checked ? this.day : null}).finally(() => {
          checkbox.checked = !!task.completed; checkbox.disabled = !!this.error;
        });
      };
      row.createSpan({text:task.text,cls:'norin-tasks-text',attr:{title:`任务日期 ${task.date}\n创建 ${task.created}${task.completed ? `\n完成 ${task.completed}` : ''}`}});
      this.button(row,'编辑任务','pencil',() => {if (!this.busy && !this.error) this.editor(row,task);});
      this.button(row,'删除任务','trash-2',() => {if (!this.busy && !this.error) this.deleteEditor(row,task);});
    }
  }
  private deleteEditor(target:HTMLElement,task:Task):void {
    if (this.containerEl.querySelector('form')) return;
    const form = document.createElement('form'); form.className = 'norin-tasks-editor';
    form.createSpan({text:`删除“${task.text}”？`});
    const confirm = form.createEl('button',{text:'删除',type:'submit'});
    const cancel = form.createEl('button',{text:'取消',type:'button'});
    cancel.onclick = () => {if(!this.busy) this.render();};
    form.onsubmit = event => {event.preventDefault();confirm.disabled = true;void this.change({type:'delete',id:task.id}).then(ok => {if(ok) this.render();else confirm.disabled = false;});};
    target.replaceWith(form); this.lockNavigation(); cancel.focus();
  }
  private editor(target:HTMLElement,task?:Task):void {
    if (this.containerEl.querySelector('form')) return;
    const form = document.createElement('form'); form.className = 'norin-tasks-editor';
    const input = form.createEl('input',{type:'text',value:task?.text ?? '',attr:{'aria-label':task ? '编辑任务' : '新增任务',placeholder:'Task…'}});
    const save = form.createEl('button',{text:'保存',type:'submit'});
    const cancel = form.createEl('button',{text:'取消',type:'button'});
    cancel.onclick = () => {if(!this.busy) this.render();};
    input.onkeydown = e => {if(e.key === 'Escape' && !this.busy) {e.preventDefault();this.render();}};
    form.onsubmit = event => {
      event.preventDefault(); if (this.busy) return;
      let text:string;
      try {text = cleanText(input.value);} catch(error) {new Notice(message(error));return;}
      const action:Action = task ? {type:'edit',id:task.id,text} : {type:'add',task:{id:crypto.randomUUID(),text,date:this.day,created:new Date().toISOString(),completed:null}};
      save.disabled = true; cancel.disabled = true; input.disabled = true;
      void this.change(action).then(ok => {if(ok) this.render();else {save.disabled=false;cancel.disabled=false;input.disabled=false;input.focus();}});
    };
    target.replaceWith(form); this.lockNavigation(); input.focus();
  }
  private calendar():void {
    const box = this.containerEl.createDiv('norin-tasks-calendar');
    const header = box.createDiv('norin-tasks-header');
    const first = new Date(`${this.month}-01T12:00:00`);
    const move = (delta:number) => {const d = new Date(first);d.setMonth(d.getMonth()+delta);this.month = localDate(d).slice(0,7);this.render();};
    this.button(header,'上个月','chevron-left',() => move(-1));
    header.createSpan({text:first.toLocaleDateString('en-US',{year:'numeric',month:'long'})});
    this.button(header,'下个月','chevron-right',() => move(1));
    const grid = box.createDiv({cls:'norin-tasks-calendar-grid',attr:{'aria-label':'选择任务日期'}});
    for (const label of ['Su','Mo','Tu','We','Th','Fr','Sa']) grid.createSpan({text:label,cls:'norin-tasks-weekday'});
    for (let i=0;i<first.getDay();i++) grid.createSpan();
    const days = new Date(first.getFullYear(),first.getMonth()+1,0).getDate();
    for(let n=1;n<=days;n++) {
      const key = `${this.month}-${String(n).padStart(2,'0')}`;
      const button = grid.createEl('button',{text:String(n),attr:{type:'button','aria-label':key,'aria-pressed':String(key===this.day)}});
      if(key === localDate()) button.addClass('is-today');
      if(key === this.day) button.addClass('is-selected');
      button.onclick = () => {this.day=key;this.calendarOpen=false;this.render();};
    }
  }
}
function message(error:unknown):string {return error instanceof Error ? error.message : String(error);}
