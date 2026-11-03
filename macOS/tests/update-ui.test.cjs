const {test}=require('node:test'),assert=require('node:assert/strict');const{JSDOM}=require('jsdom');
test('Mac update card exposes current version, detects release and opens its official page only after clicking',async()=>{
 const dom=new JSDOM('<!doctype html><body></body>',{url:'https://localhost/'});const old=global.document;global.document=dom.window.document;
 try{
  const {setupUpdates}=await import('../web/update-ui.js');const root='https://github.com/He-He-He-He-He-He/ZhiyunAssistant/releases/';let opened='',feeds=0;
  const native={call:async(method,p)=>{if(method==='applicationInfo')return{version:'1.8.8',platform:'darwin'};if(method==='updateFeed'){feeds++;return JSON.stringify([{draft:false,html_url:root+'tag/test',assets:[{name:'ZhiyunAssistant-Mac-1.8.9.dmg',state:'uploaded',browser_download_url:root+'download/test/app.dmg'}]}])}if(method==='openRelease')opened=p.url}};
  const el=(tag,attrs={},children=[])=>{const n=document.createElement(tag);for(const[k,v]of Object.entries(attrs)){if(k==='text')n.textContent=v;else if(k==='class')n.className=v;else n.setAttribute(k,v)}n.append(...children);return n};const button=(text,fn)=>{const n=el('button',{text});n.onclick=fn;return n};const ui=setupUpdates({native,el,button,toast:()=>{}});document.body.append(ui.card());await ui.start();assert.match(document.body.textContent,/1.8.8/);assert.match(document.body.textContent,/1.8.9/);assert.equal(feeds,1);assert.equal(opened,'');[...document.querySelectorAll('button')].find(n=>n.textContent.includes('查看')).click();await Promise.resolve();assert.equal(opened,root+'tag/test');
 }finally{global.document=old;dom.window.close()}
});
