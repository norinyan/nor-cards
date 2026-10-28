import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseConfig} from '../src/config';
test('old empty blocks retain defaults; invalid options cannot become CSS',()=>{
  assert.deepEqual(parseConfig(''),{todo:'待办',completed:'已完成',background:'theme'});
  assert.deepEqual(parseConfig('todo:\ncompleted: \nbackground: url(https://example.org)\nunknown: value'),parseConfig(''));
});
test('per-block config supports CRLF, whitespace and plain-text titles',()=>{
  assert.deepEqual(parseConfig(' todo: 今天要做\r\ncompleted: Done: today\r\nbackground: green\r\n'),{todo:'今天要做',completed:'Done: today',background:'green'});
  assert.equal(parseConfig('todo: <img src=x>\nbackground: blue').todo,'<img src=x>');
  for(const background of ['theme','white','yellow','green','blue']) assert.equal(parseConfig('background: '+background).background,background);
});
