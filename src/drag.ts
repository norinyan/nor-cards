import {ViewPlugin, WidgetType, type EditorView} from '@codemirror/view';
import {setIcon} from 'obsidian';
import {moveTask,taskBlocks} from './tasks';
import {captureRows} from './motion';

const mime='application/x-nor-card-task';
const controllers=new WeakMap<EditorView,TaskDrag>();
interface Block {from:number;to:number;checked:boolean}
interface Visual {block:Block;rows:HTMLElement[];top:number;height:number}
interface Session {text:string;source:Block;visuals:Visual[];target:number;after:boolean;ghost:HTMLElement}

export class DragHandle extends WidgetType {
  constructor(readonly from:number){super();}
  eq(other:DragHandle):boolean{return this.from===other.from;}
  toDOM(view:EditorView):HTMLElement {
    const button=view.dom.ownerDocument.createElement('button');
    button.type='button';button.className='nor-card-drag-handle';button.draggable=true;
    button.setAttribute('aria-label','拖动任务排序');setIcon(button,'grip-vertical');
    button.onmousedown=e=>e.stopPropagation();
    button.onclick=e=>{e.preventDefault();e.stopPropagation();};
    button.ondragstart=e=>controllers.get(view)?.start(e,this.from);
    return button;
  }
  ignoreEvent():boolean{return true;}
}
class TaskDrag {
  private session:Session|null=null;
  constructor(private view:EditorView){
    controllers.set(view,this);
    view.contentDOM.addEventListener('dragover',this.over,true);
    view.contentDOM.addEventListener('drop',this.drop,true);
    view.contentDOM.addEventListener('dragend',this.end,true);
    view.contentDOM.addEventListener('keydown',this.key,true);
  }
  start(event:DragEvent,from:number):void {
    const view=this.view,root=view.dom.closest<HTMLElement>('.nor-card-shell');
    if(!event.dataTransfer||!root||root.querySelector('.nor-card-error')?.textContent?.trim()||view.composing){event.preventDefault();return;}
    this.clear();
    for(const a of view.dom.getAnimations({subtree:true}))if(a.id==='nor-card-move')a.cancel();
    const text=view.state.doc.toString(),blocks=taskBlocks(text),index=blocks.findIndex(b=>b.from===from);
    if(index<0){event.preventDefault();return;}
    const source=blocks[index]!;
    let first=index,last=index;
    while(first>0&&blocks[first-1]!.checked===source.checked&&!text.slice(blocks[first-1]!.to,blocks[first]!.from).trim())first--;
    while(last+1<blocks.length&&blocks[last+1]!.checked===source.checked&&!text.slice(blocks[last]!.to,blocks[last+1]!.from).trim())last++;
    const rows=Array.from(view.contentDOM.querySelectorAll<HTMLElement>('.cm-line'));
    const visuals:Visual[]=[];
    for(const block of blocks.slice(first,last+1)){
      const own=rows.filter(row=>{const pos=view.posAtDOM(row);return pos>=block.from&&pos<=block.to;});
      if(!own.length)continue;
      const top=own[0]!.getBoundingClientRect().top,bottom=own[own.length-1]!.getBoundingClientRect().bottom;
      visuals.push({block,rows:own,top,height:bottom-top});
    }
    const visual=visuals.find(v=>v.block.from===from);
    if(!visual||visuals.length<2){event.preventDefault();return;}
    const ghost=root.ownerDocument.createElement('div');ghost.className='nor-card-shell nor-card-drag-ghost';ghost.dataset.norColor=root.dataset.norColor;
    const body=ghost.createDiv('nor-card-body');
    for(const row of visual.rows){const copy=row.cloneNode(true) as HTMLElement;copy.querySelectorAll('.nor-card-drag-handle').forEach(e=>e.remove());body.appendChild(copy);row.classList.add('nor-card-is-dragging');}
    ghost.style.width=`${visual.rows[0]!.getBoundingClientRect().width+24}px`;root.ownerDocument.body.appendChild(ghost);
    event.dataTransfer.effectAllowed='move';event.dataTransfer.setData(mime,'task');event.dataTransfer.setDragImage(ghost,Math.max(0,ghost.offsetWidth-20),16);
    this.session={text,source,visuals,target:from,after:false,ghost};root.classList.add('nor-card-sorting');
    event.stopPropagation();
  }
  private over=(event:DragEvent):void=>{
    if(!event.dataTransfer?.types.includes(mime))return;
    event.preventDefault();event.stopImmediatePropagation();
    const s=this.session;if(!s){event.dataTransfer.dropEffect='none';return;}
    event.dataTransfer.dropEffect='move';
    if(this.view.state.doc.toString()!==s.text){this.clear();return;}
    const hovered=s.visuals.find(v=>event.clientY>=v.top&&event.clientY<=v.top+v.height);
    if(!hovered||hovered.block.from===s.source.from){
      s.target=s.source.from;s.after=false;
      for(const item of s.visuals)for(const row of item.rows)row.style.removeProperty('transform');
      if(!hovered)event.dataTransfer.dropEffect='none';
      return;
    }
    const after=event.clientY>hovered.top+hovered.height/2;
    if(s.target===hovered.block.from&&s.after===after)return;
    s.target=hovered.block.from;s.after=after;
    const order=s.visuals.filter(v=>v.block.from!==s.source.from),source=s.visuals.find(v=>v.block.from===s.source.from)!;
    const at=order.indexOf(hovered)+(after?1:0);order.splice(at,0,source);
    let top=s.visuals[0]!.top;
    for(const item of order){const delta=top-item.top;for(const row of item.rows)row.style.transform=`translateY(${delta}px)`;top+=item.height;}
  };
  private drop=(event:DragEvent):void=>{
    if(!event.dataTransfer?.types.includes(mime))return;
    event.preventDefault();event.stopImmediatePropagation();
    const s=this.session;if(!s)return;
    if(this.view.state.doc.toString()!==s.text){this.clear();return;}
    const animate=captureRows(this.view.contentDOM,'.cm-line');
    this.clear();
    const text=moveTask(s.text,s.source.from,s.target,s.after);
    if(text!==s.text){this.view.dispatch({changes:{from:0,to:this.view.state.doc.length,insert:text},userEvent:'move.task'});animate();}
  };
  private key=(event:KeyboardEvent):void=>{if(event.key==='Escape'&&this.session){event.preventDefault();this.clear();}};
  private end=():void=>this.clear();
  private clear():void {
    const s=this.session;if(!s)return;
    for(const item of s.visuals)for(const row of item.rows){row.style.removeProperty('transform');row.classList.remove('nor-card-is-dragging');}
    s.ghost.remove();this.view.dom.closest('.nor-card-shell')?.classList.remove('nor-card-sorting');this.session=null;
  }
  update(update:{docChanged:boolean}):void{if(update.docChanged)this.clear();}
  destroy():void{
    this.clear();controllers.delete(this.view);
    this.view.contentDOM.removeEventListener('dragover',this.over,true);this.view.contentDOM.removeEventListener('drop',this.drop,true);this.view.contentDOM.removeEventListener('dragend',this.end,true);this.view.contentDOM.removeEventListener('keydown',this.key,true);
  }
}
export const taskDrag=ViewPlugin.fromClass(TaskDrag);
