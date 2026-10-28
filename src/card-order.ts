import {findHeader,isCardHeader} from './card';

// Drop only at Markdown block boundaries, never inside a card, code fence or YAML.
export function cardDropPositions(text:string):number[] {
  const lines=text.split('\n'),positions:number[]=[];
  let offset=0,fence:{char:string;length:number}|null=null,yaml=/^---\r?$/.test(lines[0]??'');
  if(!yaml)positions.push(0);
  for(let n=0;n<lines.length;n++){
    const line=lines[n]!,from=offset;offset+=line.length+1;
    if(yaml){if(n>0&&/^(---|\.\.\.)\r?$/.test(line))yaml=false;continue;}
    const f=/^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if(f){if(!fence)fence={char:f[1]![0]!,length:f[1]!.length};else if(f[1]![0]===fence.char&&f[1]!.length>=fence.length&&!f[2]!.trim())fence=null;continue;}
    if(fence)continue;
    if(!line.trim()){
      // A blank inside a quote/list continuation is not a top-level boundary.
      let next=n+1;while(next<lines.length&&!lines[next]!.trim())next++;
      if(next<lines.length&&/^(?: {2,}|\t)/.test(lines[next]!))continue;
      positions.push(from);
    }
  }
  if(!fence&&!yaml)positions.push(text.length);
  return [...new Set(positions)];
}
export interface CardMove {from:number;to:number;target:number;insert:string}
export function planCardMove(text:string,id:string,target:number):CardMove|null {
  const header=findHeader(text,id),lines=text.split('\n');
  let from=0;for(let i=0;i<header.line;i++)from+=lines[i]!.length+1;
  let to=from+lines[header.line]!.length;
  for(let n=header.line+1;n<lines.length&&/^ {0,3}>/.test(lines[n]!)&&!isCardHeader(lines[n]!);n++)to+=1+lines[n]!.length;
  if(text[to-1]==='\r')to--;
  if(target>=from&&target<=to||target<from&&!text.slice(target,from).trim()||target>to&&!text.slice(to,target).trim())return null;
  if(!cardDropPositions(text).includes(target))throw Error('请将卡片拖到正文块之间的空白位置。');
  // Keep all unrelated bytes. Add separators at the destination so the quoted
  // card cannot merge with another callout or adjacent Markdown block.
  const eol=text.includes('\r\n')?'\r\n':'\n';
  const block=text.slice(from,to).replace(/\r$/,'');
  const before=text.slice(0,target),after=text.slice(target);
  const prefix=before?(before.endsWith(eol+eol)?'':before.endsWith(eol)?eol:eol+eol):'';
  const suffix=after?(after.startsWith(eol+eol)?'':after.startsWith(eol)?eol:eol+eol):eol;
  return {from,to,target,insert:prefix+block+suffix};
}
