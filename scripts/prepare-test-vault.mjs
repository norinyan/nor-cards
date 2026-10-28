import {mkdir,copyFile,writeFile} from 'node:fs/promises';
const vault=new URL('../.test-vault/',import.meta.url);
await mkdir(new URL('.obsidian/plugins/nor-cards/',vault),{recursive:true});
for(const file of ['main.js','manifest.json','styles.css']) await copyFile(new URL('../'+file,import.meta.url),new URL('.obsidian/plugins/nor-cards/'+file,vault));
async function create(path,text) {try{await writeFile(new URL(path,vault),text,{flag:'wx'});}catch(error){if(error.code!=='EEXIST')throw error;}}
await create('Nor Cards Preview D1.3.md','# Nor Cards\n\n> [!nor-card|white-standard-demo-d13]+ Nor Card\n> - [ ] 检查机器人定位结果\n> - [ ] 长任务会自动换行，续行与正文对齐，复选框保留在左侧。\n> - [x] 完成的任务移到下方\n');
await create('.obsidian/community-plugins.json','["nor-cards"]\n');
console.log('Independent test vault: '+vault.pathname+'; enable Nor Cards and open Nor Cards Preview D1.3.md');
