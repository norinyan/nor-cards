import {ViewPlugin,type EditorView} from '@codemirror/view';
import {Notice,setIcon} from 'obsidian';
import {findHeader} from './card';
import {cardDropPositions,planCardMove} from './card-order';
import {captureRows} from './motion';

const mime='application/x-nor-card';
const controllers=new WeakMap<EditorView,CardDrag>();
interface Slot {pos:number;y:number}
interface Visual {node:HTMLElement;top:number;bottom:number}
interface Session {slots:Slot[];visuals:Visual[];scrollTop:number;text:string;id:string;root:HTMLElement;ghost:HTMLElement;indicator:HTMLElement;target:number|null}
export function cardDragHandle(view:EditorView,id:string):HTMLButtonElement {
  const button=view.dom.ownerDocument.createElement('button');button.type='button';
  button.className='nor-card-button nor-card-move-handle';button.draggable=true;
  button.setAttribute('aria-label','拖动整张卡片');setIcon(button,'grip-vertical');
  button.onmousedown=e=>e.stopPropagation();button.onclick=e=>{e.preventDefault();e.stopPropagation();};
  button.ondragstart=e=>controllers.get(view)?.start(e,id);
  return button;
}
class CardDrag {
  private session:Session|null=null;
  constructor(private view:EditorView){
    controllers.set(view,this);
    view.dom.addEventListener('dragover',this.over,true);view.dom.addEventListener('drop',this.drop,true);
    view.dom.addEventListener('dragend',this.end,true);view.dom.addEventListener('keydown',this.key,true);
  }
  start(event:DragEvent,id:string):void {
    const root=(event.target as HTMLElement).closest<HTMLElement>('.nor-card-shell');
    if(!event.dataTransfer||!root||this.view.composing||Array.from(this.view.dom.querySelectorAll('.nor-card-error')).some(e=>e.textContent?.trim())){event.preventDefault();return;}
    this.clear();
    const text=this.view.state.doc.toString();
    try{findHeader(text,id);}catch(e){new Notice(String(e));event.preventDefault();return;}
    const ghost=root.cloneNode(true) as HTMLElement;ghost.classList.add('nor-card-whole-ghost');
    ghost.querySelectorAll('.nor-card-move-handle,.nor-card-drag-handle,.cm-cursorLayer,.cm-selectionLayer').forEach(e=>e.remove());
    ghost.style.width=`${root.getBoundingClientRect().width}px`;
    const indicator=root.ownerDocument.createElement('div');indicator.className='nor-card-drop-line';
    root.ownerDocument.body.append(ghost,indicator);
    event.dataTransfer.effectAllowed='move';event.dataTransfer.setData(mime,id);event.dataTransfer.setDragImage(ghost,24,24);
    const slots=cardDropPositions(text).flatMap(pos=>{const rect=this.view.coordsAtPos(pos,1);return rect?[{pos,y:rect.top}]:[];});
    const visuals=Array.from(this.view.contentDOM.children).filter((e):e is HTMLElement=>e instanceof HTMLElement).map(node=>{const r=node.getBoundingClientRect();return {node,top:r.top,bottom:r.bottom};});
    this.session={text,id,root,ghost,indicator,target:null,slots,visuals,scrollTop:this.view.scrollDOM.scrollTop};root.classList.add('nor-card-whole-dragging');
    this.view.contentDOM.classList.add('nor-card-document-sorting');
    event.stopPropagation();
  }
  private preview(y:number|null):void {
    const s=this.session;if(!s)return;
    const source=s.visuals.find(v=>v.node===s.root);if(!source)return;
    const next=s.visuals[s.visuals.indexOf(source)+1],height=next?next.top-source.top:source.bottom-source.top;
    for(const item of s.visuals){
      let delta=0;
      if(y!==null){
        if(item===source)delta=y<source.top?y-source.top:y>source.bottom?y-source.top-height:0;
        else if(y<source.top&&item.top>=y&&item.top<source.top)delta=height;
        else if(y>source.bottom&&item.top>source.top&&item.top<y)delta=-height;
      }
      if(delta)item.node.style.transform=`translateY(${delta}px)`;else item.node.style.removeProperty('transform');
    }
  }
  private over=(event:DragEvent):void=>{
    if(!event.dataTransfer?.types.includes(mime))return;
    event.preventDefault();event.stopImmediatePropagation();
    const s=this.session;if(!s){event.dataTransfer.dropEffect='none';return;}
    if(this.view.state.doc.toString()!==s.text){this.clear();return;}
    const scrollDelta=this.view.scrollDOM.scrollTop-s.scrollTop;
    const slots=s.slots.map(slot=>({pos:slot.pos,y:slot.y-scrollDelta})),nearest=slots.reduce<Slot|null>((best,slot)=>!best||Math.abs(slot.y-event.clientY)<Math.abs(best.y-event.clientY)?slot:best,null);
    const rect=this.view.contentDOM.getBoundingClientRect();
    if(!nearest||Math.abs(nearest.y-event.clientY)>90||event.clientX<rect.left||event.clientX>rect.right){s.target=null;s.indicator.hidden=true;this.preview(null);event.dataTransfer.dropEffect='none';return;}
    s.target=nearest.pos;s.indicator.hidden=false;event.dataTransfer.dropEffect='move';
    this.preview(nearest.y+scrollDelta);
    Object.assign(s.indicator.style,{left:`${rect.left}px`,top:`${nearest.y}px`,width:`${rect.width}px`});
  };
  private drop=(event:DragEvent):void=>{
    if(!event.dataTransfer?.types.includes(mime))return;
    event.preventDefault();event.stopImmediatePropagation();
    const s=this.session;if(!s)return;
    const animate=captureRows(this.view.contentDOM,':scope > *');
    this.clear();
    if(s.target===null||this.view.state.doc.toString()!==s.text)return;
    try{
      const move=planCardMove(s.text,s.id,s.target);if(!move)return;
      // A single transaction makes the entire move atomic and undoable.
      this.view.dispatch({changes:[{from:move.from,to:move.to,insert:''},{from:move.target,insert:move.insert}],userEvent:'move.card'});
      animate();
    }catch(e){new Notice(String(e));}
  };
  private end=():void=>this.clear();
  private key=(event:KeyboardEvent):void=>{if(event.key==='Escape'&&this.session){event.preventDefault();this.clear();}};
  private clear():void{const s=this.session;if(!s)return;this.view.contentDOM.classList.remove('nor-card-document-sorting');for(const item of s.visuals)item.node.style.removeProperty('transform');s.root.classList.remove('nor-card-whole-dragging');s.ghost.remove();s.indicator.remove();this.session=null;}
  update(update:{docChanged:boolean}):void{if(update.docChanged)this.clear();}
  destroy():void{this.clear();controllers.delete(this.view);this.view.dom.removeEventListener('dragover',this.over,true);this.view.dom.removeEventListener('drop',this.drop,true);this.view.dom.removeEventListener('dragend',this.end,true);this.view.dom.removeEventListener('keydown',this.key,true);}
}
export const wholeCardDrag=ViewPlugin.fromClass(CardDrag);
