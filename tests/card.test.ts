import {test} from 'node:test';
import assert from 'node:assert/strict';
import {cardText,dateLabel,parseMetadata,updateHeader,findHeader} from '../src/card';
test('blank card defaults and local date label',()=>{
  assert.equal(cardText('test-id'),'> [!nor-card|white-standard-test-id]+ Nor Card\n> - [ ] \n');
  assert.equal(dateLabel(new Date(2026,9,28,0,1)),'Oct 28, Wed');
  assert.throws(()=>cardText('bad] injected'));
  assert.equal(parseMetadata('white-standard-test-id')?.id,'test-id');
  assert.equal(parseMetadata('url(evil)-large-test'),null);
});
test('appearance and fold touch only the selected header, preserving prose and CRLF',()=>{
  const source='Before\r\n'+cardText('one').replace(/\n/g,'\r\n')+'> ### Editable heading\r\n> - [ ] Task\r\n\r\n'+cardText('two').replace(/\n/g,'\r\n')+'After';
  const changed=updateHeader(source,'one',{color:'black',fold:'-'}).content;
  assert.equal(changed,source.replace('white-standard-one]+','black-standard-one]-'));
  assert.deepEqual(findHeader(changed,'one').card,{id:'one',color:'black',size:'standard',fold:'-'});
  assert.equal(updateHeader(changed,'one',{cycle:true}).content,changed.replace('black-standard-one','white-standard-one'));
});
test('missing and duplicate IDs fail closed, examples are ignored',()=>{
  const one=cardText('one');
  assert.throws(()=>updateHeader(one,'missing',{color:'green'}));
  assert.throws(()=>updateHeader(one+'\n'+one,'one',{color:'green'}));
  const example='```markdown\n'+one+'```\n';
  assert.throws(()=>updateHeader(example,'one',{color:'green'}));
  assert.equal(updateHeader(example+one,'one',{color:'green'}).content,example+one.replace('white-standard','green-standard'));
});

test('cycle is white to green to black to white, preserving legacy size and body',()=>{
  const source='> [!nor-card|white-large-legacy]+ Nor Card\n> ### Title\n> - [ ] Keep\n';
  let content=source;
  for(const color of ['green','black','white']) {content=updateHeader(content,'legacy',{cycle:true}).content;assert.equal(findHeader(content,'legacy').card.color,color);assert.equal(findHeader(content,'legacy').card.size,'large');assert.ok(content.endsWith('> ### Title\n> - [ ] Keep\n'));}
  assert.equal(content,source);
});

test('selected date is persisted independently and validated',()=>{
  const source=cardText('dated');
  const selected=updateHeader(source,'dated',{date:'2026-10-12'}).content;
  assert.equal(findHeader(selected,'dated').card.date,'2026-10-12');
  assert.equal(selected.split('\n').slice(1).join('\n'),source.split('\n').slice(1).join('\n'));
  assert.equal(findHeader(updateHeader(selected,'dated',{cycle:true}).content,'dated').card.date,'2026-10-12');
  assert.throws(()=>updateHeader(source,'dated',{date:'2026-02-30'}));
});

import {ChangeSet,Text} from '@codemirror/state';
import {cardDropPositions,planCardMove} from '../src/card-order';
function moved(text:string,id:string,target:number):string {
  const move=planCardMove(text,id,target);if(!move)return text;
  return ChangeSet.of([{from:move.from,to:move.to,insert:''},{from:move.target,insert:Text.of(move.insert.split('\n'))}],text.length).apply(Text.of(text.split('\n'))).toString();
}
test('whole-card move keeps date, fold, multiline body and other text; can move both directions',()=>{
  const card='> [!nor-card|black-standard-moving]- Nor Card <!-- nor-date:2026-10-12 -->\n> - [ ] A\n>   details\n> - [x] B';
  const note='Before\n\n'+card+'\n\nMiddle\n\n'+cardText('other')+'\nAfter\n';
  const result=moved(note,'moving',note.length);
  assert.ok(result.endsWith(card+'\n'));
  assert.ok(result.startsWith('Before\n\n\n\nMiddle\n\n'+cardText('other')+'\nAfter\n'));
  assert.equal(result.split(card).length,2);
  assert.ok(moved(result,'moving',0).startsWith(card+'\n\nBefore'));
});
test('drop positions exclude fenced code, YAML, indented continuation and card interiors',()=>{
  const note='---\ntitle: Test\n\n---\n\n```md\n\nexample\n```\n\n'+cardText('moving')+'\nText\n\n  continuation\n';
  const positions=cardDropPositions(note);
  assert.ok(!positions.includes(0));
  assert.ok(!positions.includes(note.indexOf('\n\n---')+1));
  assert.ok(!positions.includes(note.indexOf('\n\nexample')+1));
  assert.ok(!positions.includes(note.indexOf('\n\n  continuation')+1));
  assert.throws(()=>planCardMove(note,'moving',note.indexOf('example')));
  assert.equal(planCardMove(note,'moving',note.indexOf('> - [ ] ')),null);
  assert.throws(()=>planCardMove(note+'\n'+cardText('moving'),'moving',note.length));
});
test('whole-card movement preserves CRLF and trailing content',()=>{
  const card=cardText('moving').trimEnd().replace(/\n/g,'\r\n');
  const note='Before\r\n\r\n'+card+'\r\n\r\nAfter\r\n';
  const result=moved(note,'moving',0);
  assert.ok(result.startsWith(card+'\r\n\r\nBefore'));
  assert.ok(result.endsWith('\r\n\r\nAfter\r\n'));
  assert.equal(result.replace(/\r\n/g,'' ).includes('\n'),false);
});

test('adjacent card headers never become another card body or move range',async()=>{
  const {editBody}=await import('../src/card');
  const one=cardText('one').trimEnd(),two=cardText('two').trimEnd();
  const note=one+'\n'+two+'\n\nOutside\n';
  assert.equal(editBody(note,'one',body=>body+' changed'),one+' changed\n'+two+'\n\nOutside\n');
  const result=moved(note,'one',note.length);
  assert.ok(result.includes(two+'\n\nOutside\n'));
  assert.ok(result.endsWith(one+'\n'));
});

test('custom title preserves date, body and other header metadata',async()=>{
  const {readTitle}=await import('../src/card');
  const source='> [!nor-card|green-standard-title]+ Nor Card <!-- nor-date:2026-10-12 -->\n> - [ ] Keep\n';
  assert.equal(readTitle(source.split('\n')[0]!),'Tasks');
  const changed=updateHeader(source,'title',{title:'项目 Tasks & Ideas'}).content;
  assert.equal(readTitle(changed.split('\n')[0]!),'项目 Tasks & Ideas');
  assert.ok(changed.includes('<!-- nor-date:2026-10-12 -->'));
  assert.ok(changed.endsWith('\n> - [ ] Keep\n'));
  const cycled=updateHeader(changed,'title',{cycle:true}).content;
  assert.equal(readTitle(cycled.split('\n')[0]!),'项目 Tasks & Ideas');
});
