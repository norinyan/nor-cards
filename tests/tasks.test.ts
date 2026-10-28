import {test} from 'node:test';
import assert from 'node:assert/strict';
import {moveTask,toggleTask} from '../src/tasks';
import {editBody} from '../src/card';
test('completion moves entire multiline task to bottom; reopening goes before completed',()=>{
  const input='- [ ] A\n  continuation\n- [ ] B\n- [x] Earlier';
  const done=toggleTask(input,0);
  assert.equal(done,'- [ ] B\n- [x] Earlier\n- [x] A\n  continuation');
  assert.equal(toggleTask(done,done.indexOf('- [x] A')),'- [ ] B\n- [ ] A\n  continuation\n- [x] Earlier');
});
test('prose, headings, code examples and other cards are preserved',()=>{
  const body='### Custom\n- [ ] A\nParagraph\n```\n- [ ] Example\n```\n- [ ] B';
  const result=toggleTask(body,body.indexOf('- [ ] A'));
  assert.equal(result,'### Custom\nParagraph\n```\n- [ ] Example\n```\n- [ ] B\n- [x] A');
  const note='Before\r\n> [!nor-card|white-standard-one]+ Nor Card\r\n> - [ ] A\r\n\r\nAfter\r\n';
  assert.equal(editBody(note,'one',text=>toggleTask(text,0)),note.replace('- [ ] A','- [x] A'));
});

test('drag sorting preserves multiline blocks, duplicate text and trailing newline',()=>{
  const text='- [ ] Same\n  first details\n- [ ] Same\n- [ ] Third\n';
  const down=moveTask(text,0,text.indexOf('- [ ] Third'),true);
  assert.equal(down,'- [ ] Same\n- [ ] Third\n- [ ] Same\n  first details\n');
  assert.equal(moveTask(down,down.lastIndexOf('- [ ] Same'),0,false),text);
});
test('completed sorting stays within the same list and completion group',()=>{
  const text='- [ ] Open\n- [x] Done A\n- [x] Done B';
  assert.equal(moveTask(text,text.indexOf('- [x] Done B'),text.indexOf('- [x] Done A'),false),'- [ ] Open\n- [x] Done B\n- [x] Done A');
  assert.throws(()=>moveTask(text,0,text.indexOf('- [x] Done A'),true));
  const separated='- [ ] A\n### Another list\n- [ ] B';
  assert.throws(()=>moveTask(separated,0,separated.indexOf('- [ ] B'),true));
});
test('sorting persists Markdown order without changing card date or other content',()=>{
  const note='Before\r\n> [!nor-card|green-standard-one]+ Nor Card <!-- nor-date:2026-10-12 -->\r\n> - [ ] A\r\n> - [ ] B\r\n\r\nAfter\r\n';
  const sorted=editBody(note,'one',text=>moveTask(text,0,text.indexOf('- [ ] B'),true));
  assert.equal(sorted,note.replace('> - [ ] A\r\n> - [ ] B','> - [ ] B\r\n> - [ ] A'));
});
