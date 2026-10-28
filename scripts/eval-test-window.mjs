import {writeFile} from 'node:fs/promises';
// Developer helper: evaluates stdin only in the isolated local test vault.
const targets = await (await fetch('http://127.0.0.1:9333/json')).json();
const target = targets.find(t=>t.url==='app://obsidian.md/index.html' && t.title.includes('.test-vault'));
if (!target) throw Error('Isolated test vault window not found');
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
let id=0;const pending = new Map();
ws.onmessage = event => {const msg=JSON.parse(event.data);if(msg.id) {const p=pending.get(msg.id);pending.delete(msg.id);msg.error?p.reject(msg.error):p.resolve(msg.result);}};
const call = (method,params) => new Promise((resolve,reject)=>{pending.set(++id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
let expression='';for await (const chunk of process.stdin) expression+=chunk;
try {
  const guard = await call('Runtime.evaluate',{expression:'app.vault.adapter.basePath',returnByValue:true});
  if (guard.result.value !== new URL('../.test-vault',import.meta.url).pathname) throw Error('Wrong vault; refusing evaluation');
  const result=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});
  if(result.exceptionDetails) throw Error(JSON.stringify(result.exceptionDetails));
  console.log(JSON.stringify(result.result.value,null,2));
  if(process.argv[2]) {
    const clip=result.result.value?.clip;
    const shot=await call('Page.captureScreenshot',{format:'png',...(clip ? {clip} : {})});
    await writeFile(process.argv[2],Buffer.from(shot.data,'base64'));
    console.log('Screenshot: '+process.argv[2]);
  }
} finally {ws.close();}
