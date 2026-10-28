import {MarkdownRenderChild, MarkdownView, Notice, Plugin, TFile, setIcon, type Editor} from 'obsidian';
import {cardEditor,focusCard} from './editor';
import {cardText,findHeader,editBody,parseMetadata,updateHeader,readTitle,type Patch,type Color} from './card';
import {attachTitle} from './title';
import {attachCalendar,renderDateTitle} from './calendar';
import {toggleTask} from './tasks';

export default class NorCards extends Plugin {
  cards=new Set<CardView>();
  private writes:Promise<unknown>=Promise.resolve();
  onload():void {
    this.registerEditorExtension(cardEditor());
    this.addCommand({id:'insert-nor-card',name:'Insert Nor Card',editorCallback:editor=>this.insert(editor)});
    this.registerMarkdownPostProcessor((el,ctx)=>{
      const nodes=[...Array.from(el.querySelectorAll<HTMLElement>('.callout[data-callout="nor-card"]'))];
      if(el.matches('.callout[data-callout="nor-card"]'))nodes.unshift(el);
      for(const node of nodes) {
        if(node.dataset.norEnhanced)continue;
        const meta=parseMetadata(node.dataset.calloutMetadata ?? '');
        if(!meta)continue;
        node.dataset.norEnhanced='true';
        let selectedDate:string|undefined,selectedTitle='Tasks';
        const section=ctx.getSectionInfo(node);
        try{if(section){const header=findHeader(section.text,meta.id);selectedDate=header.card.date;selectedTitle=readTitle(header.raw);}}catch{/* Keep render readable; writes still validate IDs. */}
        ctx.addChild(new CardView(node,this,ctx.sourcePath,selectedDate,selectedTitle));
      }
    });
    // Refresh only the displayed label: never rewrite a note to advance the date.
    this.registerInterval(window.setInterval(()=>this.refreshDates(),30_000));
    this.registerDomEvent(document,'visibilitychange',()=>this.refreshDates());
    this.registerEvent(this.app.workspace.on('active-leaf-change',()=>this.refreshDates()));
  }
  private refreshDates():void {for(const card of this.cards)card.refreshDate();for(const label of Array.from(document.querySelectorAll<HTMLElement>('[data-nor-date]')))renderDateTitle(label,label.dataset.norDate||undefined);}
  private insert(editor:Editor):void {
    const from=editor.getCursor('from'),to=editor.getCursor('to');
    // Never replace selected prose with an empty card.
    if(from.line!==to.line || from.ch!==to.ch){new Notice('请先将光标放在要插入卡片的位置，不要选中文字。');return;}
    const prefix=from.ch>0 ? '\n\n' : (from.line>0 && editor.getLine(from.line-1).trim() ? '\n' : '');
    const id=crypto.randomUUID();
    const text=prefix+cardText(id)+'\n';
    editor.replaceRange(text,from);
    editor.setCursor({line:from.line+prefix.split('\n').length,ch:2});
    editor.focus();
    window.setTimeout(()=>{const root=document.querySelector<HTMLElement>(`[data-nor-id="${id}"]`);if(root)focusCard(root);},50);
  }
  update(path:string,id:string,patch:Patch):Promise<void> {
    const next=this.writes.then(async()=>{
      let applied:Patch=patch;
      let view=this.app.workspace.getActiveViewOfType(MarkdownView);
      if(view?.file?.path!==path || view.getMode()!=='source')view=null;
      if(!view)this.app.workspace.iterateAllLeaves(leaf=>{
        if(!view && leaf.view instanceof MarkdownView && leaf.view.file?.path===path && leaf.view.getMode()==='source')view=leaf.view;
      });
      if(view) {
        const editor=view.editor;
        const edit=updateHeader(editor.getValue(),id,patch);
        applied={...patch,color:parseMetadata(/\[!nor-card\|([^\]]+)/.exec(edit.replacement)![1]!)!.color};
        editor.replaceRange(edit.replacement,{line:edit.header.line,ch:0},{line:edit.header.line,ch:edit.header.raw.length});
      } else {
        const file=this.app.vault.getAbstractFileByPath(path);
        if(!(file instanceof TFile))throw Error('当前笔记已不存在。');
        await this.app.vault.process(file,content=>{const edit=updateHeader(content,id,patch);applied={...patch,color:parseMetadata(/\[!nor-card\|([^\]]+)/.exec(edit.replacement)![1]!)!.color};return edit.content;});
      }
      // Update cached reading and Live Preview instances of this same card.
      for(const card of this.cards)if(card.path===path && card.id===id)card.apply(applied);
    });
    this.writes=next.catch(()=>{});
    return next;
  }
  reorder(path:string,id:string,bodyLine:number):Promise<void> {
    const next=this.writes.then(async()=>{
      const change=(content:string)=>editBody(content,id,body=>{
        const lines=body.split('\n');
        if(bodyLine<0||bodyLine>=lines.length||!/^[-*+] \[[ xX]\] /.test(lines[bodyLine]!))throw Error('此任务不能自动移动，请在正文中编辑。');
        const position=lines.slice(0,bodyLine).reduce((n,line)=>n+line.length+1,0);
        return toggleTask(body,position);
      });
      let view=this.app.workspace.getActiveViewOfType(MarkdownView);
      if(view?.file?.path!==path||view.getMode()!=='source')view=null;
      if(!view)this.app.workspace.iterateAllLeaves(leaf=>{if(!view&&leaf.view instanceof MarkdownView&&leaf.view.file?.path===path&&leaf.view.getMode()==='source')view=leaf.view;});
      if(view){
        const editor=view.editor,before=editor.getValue(),after=change(before);
        let from=0,to=before.length,end=after.length;
        while(from<to&&from<end&&before[from]===after[from])from++;
        while(to>from&&end>from&&before[to-1]===after[end-1]){to--;end--;}
        editor.replaceRange(after.slice(from,end),editor.offsetToPos(from),editor.offsetToPos(to));
      }else{
        const file=this.app.vault.getAbstractFileByPath(path);if(!(file instanceof TFile))throw Error('笔记已不存在。');
        await this.app.vault.process(file,change);
      }
    });
    this.writes=next.catch(()=>{});return next;
  }

}
class CardView extends MarkdownRenderChild {
  id='';
  private color:Color='white';
  private folded=false;
  private date!:HTMLButtonElement;
  private closeCalendar?:()=>void;
  private syncTitle?:(title:string)=>void;
  private fold!:HTMLButtonElement;
  constructor(el:HTMLElement,private plugin:NorCards,readonly path:string,private selectedDate?:string,private selectedTitle='Tasks'){super(el);}
  onload():void {
    const meta=parseMetadata(this.containerEl.dataset.calloutMetadata ?? '');
    if(!meta)return;
    this.id=meta.id;this.color=meta.color;
    this.folded=this.containerEl.dataset.calloutFold==='-';
    this.plugin.cards.add(this);
    const oldTitle=this.containerEl.querySelector<HTMLElement>(':scope > .callout-title');
    if(!oldTitle)return;
    const header=this.containerEl.ownerDocument.createElement('div');header.className='nor-card-header';
    // Replace only native chrome. The content and Obsidian's editing/checkbox handlers stay intact.
    const heading=header.createDiv('nor-card-heading');
    const title=heading.createDiv();
    this.syncTitle=attachTitle(title,this.selectedTitle,value=>this.change({title:value}));
    this.date=heading.createEl('button',{cls:'nor-card-date',attr:{type:'button'}});
    this.closeCalendar=attachCalendar(this.date,()=>this.selectedDate,value=>this.change({date:value}));
    const controls=header.createDiv('nor-card-controls');
    const appearance=this.button(controls,'卡片外观','palette');
    appearance.onclick=event=>{event.stopPropagation();event.preventDefault();this.change({cycle:true});};
    this.fold=this.button(controls,'折叠卡片','chevron-up');
    this.fold.onclick=event=>{event.stopPropagation();event.preventDefault();this.change({fold:this.folded ? '+' : '-'});};
    header.addEventListener('pointerdown',event=>event.stopPropagation());
    header.addEventListener('mousedown',event=>{if(!(event.target instanceof Element&&event.target.closest('.nor-card-title')))event.preventDefault();event.stopPropagation();});
    header.addEventListener('click',event=>event.stopPropagation());
    oldTitle.replaceWith(header);
    this.registerDomEvent(this.containerEl,'click',event=>{
      const target=event.target;
      if(!(target instanceof HTMLInputElement)||target.type!=='checkbox')return;
      const line=Number(target.dataset.line);if(!Number.isInteger(line))return;
      event.preventDefault();event.stopImmediatePropagation();
      void this.plugin.reorder(this.path,this.id,line-1).catch(error=>new Notice(String(error)));
    },{capture:true});
    // Presentation only: the final empty unchecked row is an entry affordance.
    const lastList=this.containerEl.querySelector(':scope > .callout-content')?.lastElementChild;
    const lastItem=lastList?.matches('ul.contains-task-list') ? lastList.lastElementChild : null;
    if(lastItem?.matches('li.task-list-item')&&!lastItem.textContent?.trim()&&!lastItem.querySelector<HTMLInputElement>('input[type="checkbox"]')?.checked)lastItem.classList.add('nor-card-task-empty');
    this.apply({});this.refreshDate();
  }
  onunload():void {this.closeCalendar?.();this.plugin.cards.delete(this);}
  refreshDate():void {if(this.date)renderDateTitle(this.date,this.selectedDate);}
  apply(patch:Patch):void {
    if(patch.title!==undefined){this.selectedTitle=patch.title;this.syncTitle?.(patch.title);}
    if(patch.date!==undefined){this.selectedDate=patch.date;this.refreshDate();}
    if(patch.color)this.color=patch.color;
    if(patch.fold)this.folded=patch.fold==='-';
    this.containerEl.dataset.norColor=this.color;
    this.containerEl.toggleClass('is-collapsed',this.folded);
    const content=this.containerEl.querySelector<HTMLElement>(':scope > .callout-content');
    if(content){content.hidden=this.folded;content.style.removeProperty('display');}
    if(this.fold){setIcon(this.fold,this.folded ? 'chevron-down' : 'chevron-up');this.fold.setAttribute('aria-label',this.folded ? '展开卡片' : '折叠卡片');this.fold.setAttribute('aria-expanded',String(!this.folded));}
  }
  private button(parent:HTMLElement,label:string,icon:string):HTMLButtonElement {
    const button=parent.createEl('button',{cls:'nor-card-button',attr:{type:'button','aria-label':label}});
    setIcon(button,icon);return button;
  }
  private change(patch:Patch):void {void this.plugin.update(this.path,this.id,patch).catch(error=>new Notice(error instanceof Error ? error.message : String(error)));}
}
