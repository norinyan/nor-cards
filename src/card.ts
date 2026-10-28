export const COLORS = ['white','black','green'] as const;
export const SIZES = ['small','standard','large'] as const;
export type Color = typeof COLORS[number];
export type Size = typeof SIZES[number];
export interface Card {id:string;color:Color;size:Size;fold:'+'|'-';date?:string;title?:string}
export type Patch = Partial<Pick<Card,'color'|'fold'>> & {cycle?:boolean;date?:string;title?:string};
const metadata = /^(white|black|green)-(small|standard|large)-([a-zA-Z0-9-]+)$/;
export function parseMetadata(value:string):Omit<Card,'fold'>|null {
  const m=metadata.exec(value);
  return m ? {color:m[1] as Color,size:m[2] as Size,id:m[3]!} : null;
}
// Adjacent card headers start a new card even before a separator is restored.
export function isCardHeader(line:string):boolean {
  const match=/^ {0,3}>\s*\[!nor-card\|([^\]]+)\][+-]/.exec(line);
  return !!(match&&parseMetadata(match[1]!));
}
export function readTitle(header:string):string {
  const encoded=/<!-- nor-title:(\S*) -->/.exec(header)?.[1];
  try{return encoded?decodeURIComponent(encoded).trim()||'Tasks':'Tasks';}catch{return 'Tasks';}
}
export function dateLabel(date=new Date()):string {
  return `${date.toLocaleDateString('en-US',{month:'short'})} ${date.getDate()}, ${date.toLocaleDateString('en-US',{weekday:'short'})}`;
}
export function cardText(id:string):string {
  if(!/^[a-zA-Z0-9-]+$/.test(id))throw Error('Invalid card ID');
  return `> [!nor-card|white-standard-${id}]+ Nor Card\n> - [ ] \n`;
}
interface Header {line:number;raw:string;card:Card;prefix:string;suffix:string}
export function findHeader(content:string,id:string):Header {
  const found:Header[]=[];
  // A card is a top-level callout. Ignore fenced code examples.
  let fence:{char:string;length:number}|null=null;
  content.split(/\r?\n/).forEach((raw,line)=>{
    const f=/^ {0,3}(`{3,}|~{3,})(.*)$/.exec(raw);
    if(f){if(!fence)fence={char:f[1]![0]!,length:f[1]!.length};else if(f[1]![0]===fence.char&&f[1]!.length>=fence.length&&!f[2]!.trim())fence=null;return;}
    if(fence)return;
    const m=/^( {0,3}>\s*\[!nor-card\|)([^\]]+)(\][+-])(.*)$/.exec(raw);
    if(!m)return;
    const meta=parseMetadata(m[2]!);
    if(meta?.id===id)found.push({line,raw,card:{...meta,fold:m[3]![1] as '+'|'-',...(readDate(m[4]!)?{date:readDate(m[4]!)}:{})},prefix:m[1]!,suffix:m[4]!});
  });
  if(found.length!==1)throw Error(found.length ? '卡片 ID 重复，请先修复当前笔记中的卡片标记。' : '卡片已移动或删除，请重新打开笔记后重试。');
  return found[0]!;
}
export function updateHeader(content:string,id:string,patch:Patch):{header:Header;replacement:string;content:string} {
  const header=findHeader(content,id);
  const card={...header.card,...patch};
  if(patch.cycle)card.color=nextColor(header.card.color);
  if(!COLORS.includes(card.color)||!SIZES.includes(card.size)||!['+','-'].includes(card.fold))throw Error('Invalid card appearance');
  let suffix=header.suffix;
  if(patch.date!==undefined){if(!validDate(patch.date))throw Error('无效日期。');suffix=suffix.replace(/ <!-- nor-date:\d{4}-\d{2}-\d{2} -->/g,'')+` <!-- nor-date:${patch.date} -->`;}
  if(patch.title!==undefined){const title=patch.title.replace(/[\r\n]+/g,' ').trim()||'Tasks';suffix=suffix.replace(/ <!-- nor-title:\S* -->/g,'')+` <!-- nor-title:${encodeURIComponent(title)} -->`;}
  const replacement=`${header.prefix}${card.color}-${card.size}-${id}]${card.fold}${suffix}`;
  const lines=content.split('\n');
  lines[header.line]=replacement+(lines[header.line]!.endsWith('\r') ? '\r' : '');
  return {header,replacement,content:lines.join('\n')};
}

export function nextColor(color:Color):Color {return color==='white'?'green':color==='green'?'black':'white';}

export function validDate(value:string):boolean {
  if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
  const d=new Date(`${value}T12:00:00Z`);return !isNaN(d.getTime())&&d.toISOString().slice(0,10)===value;
}
export function readDate(header:string):string|undefined {
  const value=/<!-- nor-date:(\d{4}-\d{2}-\d{2}) -->/.exec(header)?.[1];return value&&validDate(value)?value:undefined;
}
export function displayDate(value?:string):string {return dateLabel(value?new Date(`${value}T12:00:00`):new Date());}

// Reading view uses the same body transformation, preserving everything outside this card.
export function editBody(content:string,id:string,change:(body:string)=>string):string {
  const header=findHeader(content,id),lines=content.split('\n');
  let end=header.line+1;
  const body:string[]=[];
  while(end<lines.length&&!isCardHeader(lines[end]!)){const m=/^ {0,3}> ?(.*?)(\r?)$/.exec(lines[end]!);if(!m)break;body.push(m[1]!);end++;}
  const eol=content.includes('\r\n')?'\r':'';
  const next=change(body.join('\n')).split('\n').map(line=>'> '+line+eol);
  lines.splice(header.line+1,end-header.line-1,...next);return lines.join('\n');
}
