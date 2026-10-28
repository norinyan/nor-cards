import {mkdir,copyFile} from 'node:fs/promises';
const folder=new URL('../dist/nor-cards/',import.meta.url);
await mkdir(folder,{recursive:true});
for(const file of ['main.js','manifest.json','styles.css']) await copyFile(new URL('../'+file,import.meta.url),new URL(file,folder));
console.log('Installable files: dist/nor-cards/');
