import {EditorSelection, EditorState, Prec, StateField, type Extension} from '@codemirror/state';
import {Decoration, EditorView, WidgetType, keymap, type DecorationSet} from '@codemirror/view';
import {defaultKeymap,history,historyKeymap,indentWithTab} from '@codemirror/commands';
import {editorLivePreviewField,setIcon,Notice} from 'obsidian';
import {readDate,parseMetadata,updateHeader,isCardHeader,readTitle,type Color} from './card';
import {attachTitle} from './title';
import {attachCalendar,renderDateTitle} from './calendar';
import {toggleTask,taskBlocks} from './tasks';
import {captureRows} from './motion';
import {DragHandle,taskDrag} from './drag';
import {cardDragHandle,wholeCardDrag} from './card-drag';

export interface EditorCard {from:number;to:number;headerTo:number;id:string;color:Color;fold:'+'|'-';body:string;bodyFrom:number;date?:string;title:string}
export function scanCards(state:Pick<EditorState,'doc'>):EditorCard[] {
  const cards:EditorCard[]=[];
  let fence:{char:string;length:number}|null=null;
  for(let n=1;n<=state.doc.lines;n++) {
    const line=state.doc.line(n),f=/^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line.text);
    if(f){if(!fence)fence={char:f[1]![0]!,length:f[1]!.length};else if(f[1]![0]===fence.char&&f[1]!.length>=fence.length&&!f[2]!.trim())fence=null;continue;}
    if(fence)continue;
    const h=/^ {0,3}>\s*\[!nor-card\|([^\]]+)\]([+-]).*$/.exec(line.text),meta=h&&parseMetadata(h[1]!);
    if(!h||!meta)continue;
    const card:EditorCard={from:line.from,to:line.to,headerTo:line.to,id:meta.id,color:meta.color,fold:h[2] as '+'|'-',body:'',bodyFrom:line.to,date:readDate(line.text),title:readTitle(line.text)};
    const body=[];
    while(n<state.doc.lines){const next=state.doc.line(n+1),p=/^ {0,3}> ?/.exec(next.text);if(!p||isCardHeader(next.text))break;body.push(next.text.slice(p[0].length));card.to=next.to;n++;}
    card.body=body.join('\n');cards.push(card);
  }
  return cards;
}
function getCard(view:EditorView,id:string):EditorCard {
  const found=scanCards(view.state).filter(card=>card.id===id);
  if(found.length!==1)throw Error('卡片已删除或 ID 重复，无法安全保存。');
  return found[0]!;
}
class Checkbox extends WidgetType {
  constructor(readonly checked:boolean,readonly position:number,readonly sortable:boolean){super();}
  eq(other:Checkbox):boolean{return this.checked===other.checked&&this.position===other.position&&this.sortable===other.sortable;}
  toDOM(view:EditorView):HTMLElement {
    const input=view.dom.ownerDocument.createElement('input');input.type='checkbox';input.checked=this.checked;input.className='nor-card-editor-checkbox';
    input.setAttribute('aria-label',this.checked?'重新打开任务':'完成任务');
    input.onmousedown=event=>event.preventDefault();
    input.onchange=()=>{
      const checked=input.checked;
      // Restore the DOM to the old widget state before reconciliation. The next
      // unchecked row may reuse this widget when a completed task moves away.
      input.checked=this.checked;
      if(this.sortable){
        const animate=captureRows(view.contentDOM,'.cm-line');
        const text=toggleTask(view.state.doc.toString(),this.position);
        view.dispatch({changes:{from:0,to:view.state.doc.length,insert:text}});
        animate();
      }
      else view.dispatch({changes:{from:this.position,to:this.position+1,insert:checked?'x':' '}});
    };
    const slot=view.dom.ownerDocument.createElement('span');slot.className='nor-card-checkbox-slot';slot.appendChild(input);return slot;
  }
  ignoreEvent():boolean{return true;}
}
// Only an explicit Enter reveals an existing empty tail; focus alone never does.
const enteredTask=StateField.define<number|null>({
  create:()=>null,
  update:(position,tr)=>{
    if(tr.isUserEvent('input.task.enter'))return tr.newDoc.lineAt(tr.newSelection.main.head).from;
    if(position===null)return null;
    const mapped=tr.changes.mapPos(position),line=tr.newDoc.lineAt(tr.newSelection.main.head);
    return line.from===mapped?mapped:null;
  }
});
// Markdown stays in the document; decoration only hides common formatting delimiters.
const bodyField=StateField.define<DecorationSet>({create:decorateBody,update:(v,tr)=>tr.docChanged||tr.selection?decorateBody(tr.state):v,provide:f=>EditorView.decorations.from(f)});
function decorateBody(state:EditorState):DecorationSet {
  const ranges=[];
  const blocks=taskBlocks(state.doc.toString()),draggable=new Set(blocks.map(task=>task.from));
  for(let n=1;n<=state.doc.lines;n++) {
    const line=state.doc.line(n),heading=/^#{1,6}\s+/.exec(line.text),task=/^(\s*[-*+] \[)([ xX])(\] )/.exec(line.text);
    if(!task&&blocks.some(block=>line.from>block.from&&line.from<=block.to))ranges.push(Decoration.line({class:'nor-card-task-continuation'}).range(line.from));
    if(heading){ranges.push(Decoration.line({class:'nor-card-body-heading'}).range(line.from));ranges.push(Decoration.replace({}).range(line.from,line.from+heading[0].length));}
    if(task){ranges.push(Decoration.line({class:'nor-card-task-line'+(task[2]!==' '?' nor-card-task-done':'')+(task[2]===' '&&!line.text.slice(task[0].length).trim()&&!state.doc.sliceString(line.to).trim()?' nor-card-task-empty'+(state.field(enteredTask,false)===line.from||state.doc.lines===1?' nor-card-task-entry-active':''):'')}).range(line.from));ranges.push(Decoration.replace({widget:new Checkbox(task[2]!.toLowerCase()==='x',line.from+task[1]!.length,!/^\s/.test(line.text))}).range(line.from,line.from+task[0].length));if(task[2]!==' '&&line.text.length>task[0].length)ranges.push(Decoration.mark({class:'nor-card-body-done'}).range(line.from+task[0].length,line.to));}
    if(task&&draggable.has(line.from)&&line.text.slice(task[0].length).trim())ranges.push(Decoration.widget({widget:new DragHandle(line.from),side:1}).range(line.to));
    for(const m of line.text.matchAll(/\*\*([^*]+)\*\*/g)) {
      const start=line.from+m.index!;ranges.push(Decoration.replace({}).range(start,start+2));ranges.push(Decoration.mark({class:'nor-card-body-strong'}).range(start+2,start+m[0].length-2));ranges.push(Decoration.replace({}).range(start+m[0].length-2,start+m[0].length));
    }
  }
  return Decoration.set(ranges,true);
}
function enter(view:EditorView):boolean {
  const selection=view.state.selection.main;if(!selection.empty)return false;
  const line=view.state.doc.lineAt(selection.head);
  const match=/^(\s*)([-*+] \[[ xX]\] |[-*+] )/.exec(line.text);
  if(match){
    const prefix=match[0];
    if(!line.text.slice(prefix.length).trim())view.dispatch({changes:{from:line.from,to:line.to,insert:''},selection:{anchor:line.from}});
    else {
      const next=line.number<view.state.doc.lines?view.state.doc.line(line.number+1):null;
      if(selection.head===line.to&&next&&/^\s*[-*+] \[ \] $/.test(next.text)&&!view.state.doc.sliceString(next.to).trim()){
        view.dispatch({selection:{anchor:next.to},scrollIntoView:true,userEvent:'input.task.enter'});
      }else{
        const insert='\n'+match[1]+(match[2]!.includes('[')?'- [ ] ':match[2]);
        view.dispatch(view.state.replaceSelection(insert),{scrollIntoView:true,userEvent:'input.task.enter'});
      }
    }
    return true;
  }
  return false;
}
const cursorInText=EditorState.transactionFilter.of(tr=>{
  if(!tr.selection)return tr;
  let changed=false;
  const ranges=tr.newSelection.ranges.map(range=>{
    if(!range.empty)return range;
    const line=tr.newDoc.lineAt(range.head),prefix=/^\s*[-*+] \[[ xX]\] /.exec(line.text);
    const target=prefix?line.from+prefix[0].length:range.head;
    if(prefix&&range.head<target){changed=true;return EditorSelection.cursor(target,1);}
    return range;
  });
  return changed?[tr,{selection:EditorSelection.create(ranges,tr.newSelection.mainIndex)}]:tr;
});
interface Mounted {id:string;root:HTMLElement;body:EditorView;sync:(card:EditorCard)=>void;destroy:()=>void}
const mounts=new WeakMap<HTMLElement,Mounted>();
class CardWidget extends WidgetType {
  constructor(readonly card:EditorCard){super();}
  eq(other:CardWidget):boolean{return this.card.id===other.card.id&&this.card.body===other.card.body&&this.card.color===other.card.color&&this.card.fold===other.card.fold&&this.card.date===other.card.date&&this.card.title===other.card.title;}
  updateDOM(dom:HTMLElement):boolean {const mount=mounts.get(dom);if(!mount||mount.id!==this.card.id)return false;mount.sync(this.card);return true;}
  toDOM(outer:EditorView):HTMLElement {
    const root=outer.dom.ownerDocument.createElement('div');root.className='nor-card-shell';root.dataset.norId=this.card.id;
    const header=root.createDiv('nor-card-header');
    const heading=header.createDiv('nor-card-heading');
    const title=heading.createDiv();
    const date=heading.createEl('button',{cls:'nor-card-date',attr:{type:'button','data-nor-date':'true'}});
    const controls=header.createDiv('nor-card-controls');
    controls.appendChild(cardDragHandle(outer,this.card.id));
    let current=this.card,baseline=current.body,conflict=false;
    const error=root.createDiv({cls:'nor-card-error',attr:{role:'status'}});
    const holder=root.createDiv('nor-card-body');
    const bodyLabel=root.createEl('span',{text:'卡片正文',attr:{id:`nor-card-body-${crypto.randomUUID()}`,hidden:''}});
    const controlsButtons:HTMLButtonElement[]=[];
    const change=(action:'cycle'|'fold'|string)=>{
      try {const card=getCard(outer,current.id);const edit=updateHeader(outer.state.doc.toString(),current.id,action==='cycle'?{cycle:true}:action==='fold'?{fold:card.fold==='+'?'-':'+'}:{date:action});outer.dispatch({changes:{from:card.from,to:card.headerTo,insert:edit.replacement}});}catch(e){new Notice(String(e));}
    };
    for(const [action,label,icon]of [['cycle','切换卡片颜色','palette'],['fold','折叠卡片','chevron-up']] as const){const b=controls.createEl('button',{cls:'nor-card-button',attr:{type:'button','aria-label':label}});setIcon(b,icon);b.onmousedown=e=>e.preventDefault();b.onclick=()=>change(action);controlsButtons.push(b);}
    const syncTitle=attachTitle(title,current.title,value=>{
      try{const card=getCard(outer,current.id),edit=updateHeader(outer.state.doc.toString(),current.id,{title:value});outer.dispatch({changes:{from:card.from,to:card.headerTo,insert:edit.replacement}});}catch(e){new Notice(String(e));}
    });
    const closeCalendar=attachCalendar(date,()=>current.date,value=>change(value));
    const body=new EditorView({parent:holder,state:EditorState.create({doc:baseline,selection:{anchor:/^[-*+] \[[ xX]\] /.exec(baseline.split('\n')[0]??'')?.[0].length??0},extensions:[
      history(),cursorInText,enteredTask,taskDrag,keymap.of([{key:'Enter',run:enter},...historyKeymap,...defaultKeymap,indentWithTab]),
      bodyField,EditorView.atomicRanges.of(v=>v.state.field(bodyField)),EditorView.lineWrapping,
      EditorView.contentAttributes.of({'aria-labelledby':bodyLabel.id}),
      EditorView.updateListener.of(update=>{
        if(!update.docChanged)return;
        for(const animation of update.view.dom.getAnimations({subtree:true}))if(animation.id==='nor-card-move')animation.cancel();
        try {
          const card=getCard(outer,current.id),text=update.state.doc.toString();
          if(conflict || card.body!==baseline)throw Error('正文有外部更新，本地输入已保留。请复制当前内容后重新打开笔记，避免覆盖另一版本。');
          baseline=text;
          const quoted=text.split('\n').map(line=>'> '+line).join('\n');
          outer.dispatch({changes:{from:card.headerTo,to:card.to,insert:'\n'+quoted}});
          error.setText('');
        }catch(e){conflict=true;error.setText(e instanceof Error?e.message:String(e));}
      })
    ]})});
    // Events belong to the inner editor, never to the notebook's outer editor.
    for(const event of ['mousedown','click','keydown','keyup','paste','cut','copy'])root.addEventListener(event,e=>e.stopPropagation());
    const mount:Mounted={id:current.id,root,body,sync:card=>{
      current=card;syncTitle(card.title);date.dataset.norDate=card.date??'';renderDateTitle(date,card.date);root.dataset.norColor=card.color;holder.hidden=card.fold==='-';
      const b=controlsButtons[1]!;b.setAttribute('aria-label',card.fold==='-'?'展开卡片':'折叠卡片');b.setAttribute('aria-expanded',String(card.fold!== '-'));setIcon(b,card.fold==='-'?'chevron-down':'chevron-up');
      if(card.body!==baseline){
        conflict=true;error.setText('正文有外部更新，本地输入已保留。请复制当前内容后重新打开笔记。');
      }
    },destroy:()=>{closeCalendar();body.destroy();}};
    mounts.set(root,mount);mount.sync(current);return root;
  }
  destroy(dom:HTMLElement):void{mounts.get(dom)?.destroy();mounts.delete(dom);}
  ignoreEvent():boolean{return true;}
}
export function focusCard(root:HTMLElement):void{const mount=mounts.get(root);if(mount){mount.body.focus();mount.body.dispatch({selection:{anchor:/^[-*+] \[[ xX]\] /.exec(mount.body.state.doc.line(1).text)?.[0].length??0}});}}
// Obsidian treats unquoted text without a separating blank as a lazy callout
// continuation. Keep our explicit card boundary and the native parser in agreement.
const separateCards=EditorState.transactionFilter.of(tr=>{
  if(!tr.docChanged||!tr.startState.field(editorLivePreviewField,false))return tr;
  const changes:{from:number;insert:string}[]=[];
  for(const card of scanCards({doc:tr.newDoc})){
    const last=tr.newDoc.lineAt(card.to);
    if(last.number>=tr.newDoc.lines)continue;
    const next=tr.newDoc.line(last.number+1);
    if(next.text.trim())changes.push({from:next.from,insert:'\n'});
  }
  return changes.length?[tr,{changes,sequential:true}]:tr;
});
export function cardEditor():Extension {
  const field=StateField.define<DecorationSet>({create:build,update:(v,tr)=>tr.docChanged||tr.state.field(editorLivePreviewField,false)!==tr.startState.field(editorLivePreviewField,false)?build(tr.state):v,provide:f=>EditorView.decorations.from(f)});
  function build(state:EditorState):DecorationSet {
    if(!state.field(editorLivePreviewField,false))return Decoration.none;
    return Decoration.set(scanCards(state).map(card=>Decoration.replace({widget:new CardWidget(card),block:true}).range(card.from,card.to)),true);
  }
  return [separateCards,wholeCardDrag,Prec.highest(field),EditorView.atomicRanges.of(v=>v.state.field(field))];
}
