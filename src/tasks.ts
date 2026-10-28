interface TaskBlock {from:number;to:number;checked:boolean;marker:number;end:number}
// Only top-level tasks move. Indented continuation lines stay with their parent.
export function taskBlocks(text:string):TaskBlock[] {
  const lines=text.split('\n'),tasks:TaskBlock[]=[];
  let offset=0,fence:string|null=null;
  for(let i=0;i<lines.length;i++) {
    const line=lines[i]!,f=/^(`{3,}|~{3,})/.exec(line);
    if(f){if(!fence)fence=f[1]![0]!;else if(f[1]![0]===fence)fence=null;offset+=line.length+1;continue;}
    const match=!fence && /^([-*+] \[)([ xX])\] /.exec(line);
    if(!match){offset+=line.length+1;continue;}
    const from=offset,marker=offset+match[1]!.length;
    let end=i;
    while(end+1<lines.length) {
      if(/^ {2,}\S|^\t/.test(lines[end+1]!)){end++;continue;}
      if(lines[end+1]==='' && end+2<lines.length && /^ {2,}\S|^\t/.test(lines[end+2]!)){end+=2;continue;}
      break;
    }
    for(let j=i;j<=end;j++)offset+=lines[j]!.length+1;
    tasks.push({from,to:offset-1,checked:match[2]!.toLowerCase()==='x',marker,end});i=end;
  }
  return tasks;
}
export function toggleTask(text:string,position:number):string {
  const task=taskBlocks(text).find(t=>position>=t.from&&position<=t.to);
  if(!task)throw Error('任务已改变，请重新点击。');
  const checked=!task.checked;
  const block=text.slice(task.from,task.marker)+(checked?'x':' ')+text.slice(task.marker+1,task.to);
  // Remove the block and exactly one adjacent newline, retaining other prose.
  const start=task.to<text.length?task.from:task.from>0?task.from-1:task.from;
  const end=task.to<text.length?task.to+1:task.to;
  const remaining=text.slice(0,start)+text.slice(end);
  if(!remaining)return block;
  if(checked)return remaining+(remaining.endsWith('\n')?'':'\n')+block;
  const firstDone=taskBlocks(remaining).find(t=>t.checked);
  if(firstDone)return remaining.slice(0,firstDone.from)+block+'\n'+remaining.slice(firstDone.from);
  return remaining+(remaining.endsWith('\n')?'':'\n')+block;
}

// Move a whole task block only within its contiguous list and completion group.
export function moveTask(text:string,from:number,targetFrom:number,after:boolean):string {
  const tasks=taskBlocks(text),sourceIndex=tasks.findIndex(t=>t.from===from),targetIndex=tasks.findIndex(t=>t.from===targetFrom);
  if(sourceIndex<0||targetIndex<0)throw Error('任务已改变，请重新拖动。');
  if(sourceIndex===targetIndex)return text;
  const source=tasks[sourceIndex]!,target=tasks[targetIndex]!;
  for(let i=Math.min(sourceIndex,targetIndex);i<=Math.max(sourceIndex,targetIndex);i++){
    if(tasks[i]!.checked!==source.checked)throw Error('请在同一完成状态的任务组内排序。');
    if(i>Math.min(sourceIndex,targetIndex)&&text.slice(tasks[i-1]!.to,tasks[i]!.from).trim())throw Error('只能在同一任务列表内排序。');
  }
  const block=text.slice(source.from,source.to);
  const start=source.to<text.length?source.from:source.from>0?source.from-1:source.from;
  const end=source.to<text.length?source.to+1:source.to;
  let position=after?target.to:target.from;
  if(position>=end)position-=end-start;
  const rest=text.slice(0,start)+text.slice(end);
  return rest.slice(0,position)+(after?'\n'+block:block+'\n')+rest.slice(position);
}
