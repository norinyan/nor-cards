export function renderDateTitle(element:HTMLElement,value?:string):void {
  const date=value?new Date(`${value}T12:00:00`):new Date();
  const caption=`${date.toLocaleDateString('en-US',{weekday:'short'})}, ${date.toLocaleDateString('en-US',{month:'short'})} ${date.getDate()} · ${date.getFullYear()}`;
  if(element.dataset.norDateLabel===caption)return;
  element.dataset.norDateLabel=caption;
  element.textContent=caption;
}

// An HTML month grid avoids platform-specific date picker behavior.
export function attachCalendar(button:HTMLButtonElement,selected:()=>string|undefined,save:(date:string)=>void):()=>void {
  let popup:HTMLElement|null=null;
  const close=()=>{popup?.remove();popup=null;button.setAttribute('aria-expanded','false');};
  button.setAttribute('aria-label','选择卡片日期');button.setAttribute('aria-expanded','false');
  button.onmousedown=e=>e.preventDefault();
  button.onclick=()=>{
    if(popup){close();return;}
    let month=new Date(selected()?`${selected()}T12:00:00`:Date.now());month.setDate(1);
    popup=button.ownerDocument.createElement('div');popup.className='nor-card-calendar';popup.setAttribute('role','dialog');popup.setAttribute('aria-label','选择卡片日期');
    (button.closest('.nor-card-header')??button.parentElement!).insertAdjacentElement('afterend',popup);button.setAttribute('aria-expanded','true');
    const render=()=>{
      if(!popup)return;popup.empty();
      const head=popup.createDiv('nor-card-calendar-head');
      const prev=head.createEl('button',{text:'‹',attr:{type:'button','aria-label':'上个月'}});
      head.createSpan({text:month.toLocaleDateString('en-US',{month:'short',year:'numeric'})});
      const next=head.createEl('button',{text:'›',attr:{type:'button','aria-label':'下个月'}});
      prev.onclick=()=>{month.setMonth(month.getMonth()-1);render();};next.onclick=()=>{month.setMonth(month.getMonth()+1);render();};
      const grid=popup.createDiv('nor-card-calendar-grid');
      for(const day of ['Su','Mo','Tu','We','Th','Fr','Sa'])grid.createSpan({text:day});
      for(let i=0;i<month.getDay();i++)grid.createSpan();
      const max=new Date(month.getFullYear(),month.getMonth()+1,0).getDate();
      for(let day=1;day<=max;day++){
        const date=`${month.getFullYear()}-${String(month.getMonth()+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
        const b=grid.createEl('button',{text:String(day),attr:{type:'button','aria-label':date,'aria-pressed':String(selected()===date)}});
        b.onclick=()=>{save(date);close();button.focus();};
      }
    };
    popup.onmousedown=e=>{e.preventDefault();e.stopPropagation();};popup.onclick=e=>e.stopPropagation();
    popup.onkeydown=e=>{if(e.key==='Escape'){close();button.focus();}};render();
  };
  renderDateTitle(button,selected());return close;
}
