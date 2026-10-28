// FLIP: keep the current visual positions, commit the data, then ease into layout.
// Match unique row text only; identical rows must never animate as each other.
export function captureRows(parent:HTMLElement,selector:string): (nextParent?:HTMLElement)=>void {
  const win=parent.ownerDocument.defaultView;
  if(!win||win.matchMedia('(prefers-reduced-motion: reduce)').matches)return ()=>{};
  const before=new Map<string,number>(),duplicates=new Set<string>();
  for(const row of Array.from(parent.querySelectorAll<HTMLElement>(selector))){
    const key=row.textContent??'';
    if(!key.trim())continue;
    if(before.has(key))duplicates.add(key);
    else before.set(key,row.getBoundingClientRect().top);
  }
  for(const key of duplicates)before.delete(key);
  for(const animation of parent.getAnimations({subtree:true}))if(animation.id==='nor-card-move')animation.cancel();
  return (nextParent=parent)=>{
    if(!nextParent.isConnected)return;
    const rows=Array.from(nextParent.querySelectorAll<HTMLElement>(selector));
    const counts=new Map<string,number>();
    for(const row of rows){const key=row.textContent??'';counts.set(key,(counts.get(key)??0)+1);}
    for(const row of rows){
      const key=row.textContent??'',top=before.get(key);
      if(top===undefined||counts.get(key)!==1)continue;
      const delta=top-row.getBoundingClientRect().top;
      if(Math.abs(delta)<1)continue;
      const animation=row.animate([{transform:`translateY(${delta}px)`},{transform:'translateY(0)'}],{duration:200,easing:'cubic-bezier(.2,.8,.2,1)'});
      animation.id='nor-card-move';
    }
  };
}
