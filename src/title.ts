// Inline title editing shares the same header persistence as date and appearance.
export function attachTitle(element:HTMLElement,initial:string,save:(title:string)=>void): (title:string)=>void {
  let current=initial;
  element.className='nor-card-title';element.contentEditable='plaintext-only';
  element.setAttribute('role','textbox');element.setAttribute('aria-multiline','false');element.textContent=current;
  element.onkeydown=event=>{
    event.stopPropagation();
    if(event.key==='Enter'&&!event.isComposing){event.preventDefault();element.blur();}
    if(event.key==='Escape'){event.preventDefault();element.textContent=current;element.blur();}
  };
  element.onblur=()=>{
    const title=(element.textContent??'').replace(/[\r\n]+/g,' ').trim()||'Tasks';
    element.textContent=title;
    if(title!==current){current=title;save(title);}
  };
  return title=>{current=title;if(element.ownerDocument.activeElement!==element)element.textContent=title;};
}
