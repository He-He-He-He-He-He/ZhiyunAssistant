export const UPDATE_FEED='https://api.github.com/repos/He-He-He-He-He-He/ZhiyunAssistant/releases?per_page=100';
export const UPDATE_ROOT='https://github.com/He-He-He-He-He-He/ZhiyunAssistant/releases/';
export interface UpdateInfo {version:string;platform:string;arch?:string}
export interface UpdateCandidate {version:string;url:string;assetUrl:string;preview:boolean}
export function compareVersions(a:string,b:string):number {
 const parse=(v:string)=>/^(\d+)\.(\d+)\.(\d+)(?:-(alpha|beta|rc)\.(\d+))?$/.exec(v);
 const x=parse(a),y=parse(b);if(!x||!y)throw Error('无法识别版本号');
 for(let i=1;i<=3;i++){const d=Number(x[i])-Number(y[i]);if(d)return Math.sign(d)}
 const rank=(s:string|undefined)=>s==='alpha'?0:s==='beta'?1:s==='rc'?2:3;
 return Math.sign(rank(x[4])-rank(y[4])||Number(x[5]||0)-Number(y[5]||0));
}
export function selectUpdate(feed:any,info:UpdateInfo):UpdateCandidate|null {
 if(!Array.isArray(feed))throw Error('更新服务返回格式无效');let best:UpdateCandidate|null=null;
 const platform=info.platform==='darwin'?'Mac':info.platform==='android'?'Android':info.platform==='harmony'?'HarmonyOS':'Windows';
 for(const release of feed){
  if(!release||release.draft||typeof release.html_url!=='string'||!release.html_url.startsWith(UPDATE_ROOT+'tag/'))continue;
  for(const asset of Array.isArray(release.assets)?release.assets:[]){
   const name=String(asset.name||''),url=String(asset.browser_download_url||'');
   if(asset.state!=='uploaded'||!url.startsWith(UPDATE_ROOT+'download/')||!name.includes(platform)||/source|debug|tests|sha256/i.test(name))continue;
   if(platform==='Mac'&&!/\.dmg$/i.test(name)||platform==='Android'&&!/\.apk$/i.test(name)||platform==='HarmonyOS'&&!/-unsigned\.hap$/i.test(name)||platform==='Windows'&&(!/\.zip$/i.test(name)||!name.includes(info.arch==='arm64'?'arm64':'x64')))continue;
   const version=name.match(/\d+\.\d+\.\d+(?:-(?:alpha|beta|rc)\.\d+)?/)?.[0];if(!version)continue;
   if(compareVersions(version,info.version)>0&&(!best||compareVersions(version,best.version)>0))best={version,url:release.html_url,assetUrl:url,preview:!!release.prerelease};
  }
 }return best;
}
export interface UpdateState {info:UpdateInfo|null;candidate:UpdateCandidate|null;checking:boolean;error:string;automatic:boolean;checkedAt:number}
type Options={info:()=>Promise<UpdateInfo>;feed:()=>Promise<string>;open:(url:string)=>Promise<unknown>;found?:(candidate:UpdateCandidate)=>void;storage?:{getItem:(k:string)=>string|null;setItem:(k:string,v:string)=>void};clock?:()=>number};
export class UpdateChecker {
 state:UpdateState={info:null,candidate:null,checking:false,error:'',automatic:true,checkedAt:0};private listeners=new Set<()=>void>();private pending:Promise<void>|null=null;private started=false;private failedAt=0;
 constructor(private options:Options){try{const value=JSON.parse(this.storage()?.getItem('release-updates-v1')||'null');if(value){this.state.automatic=value.automatic!==false;this.state.checkedAt=Number(value.checkedAt)||0;if(value.candidate?.url?.startsWith(UPDATE_ROOT+'tag/'))this.state.candidate=value.candidate;}}catch{}}
 private storage(){try{return this.options.storage||globalThis.localStorage}catch{return undefined}}
 private now(){return(this.options.clock||Date.now)()}
 subscribe(fn:()=>void){this.listeners.add(fn);return()=>{this.listeners.delete(fn)}}
 private changed(){for(const f of this.listeners)f()}
 private save(){try{this.storage()?.setItem('release-updates-v1',JSON.stringify({automatic:this.state.automatic,checkedAt:this.state.checkedAt,candidate:this.state.candidate}))}catch{}}
 setAutomatic(value:boolean){this.state.automatic=value;this.save();this.changed();if(value)void this.check(false)}
 async start(){if(this.started)return;this.started=true;try{this.state.info=await this.options.info();if(this.state.candidate&&compareVersions(this.state.candidate.version,this.state.info.version)<=0)this.state.candidate=null;this.changed();}catch{return}if(this.state.automatic)await this.check(false)}
 check(manual=true):Promise<void>{if(this.pending)return this.pending;if(!manual&&(!this.state.automatic||this.now()-this.state.checkedAt<86400000||this.failedAt&&this.now()-this.failedAt<3600000))return Promise.resolve();
  this.pending=(async()=>{this.state.checking=true;this.state.error='';this.changed();try{const info=await this.options.info(),text=await this.options.feed();if(text.length>2097152)throw Error('更新数据过大');const candidate=selectUpdate(JSON.parse(text),info);this.state.info=info;this.state.candidate=candidate;this.state.checkedAt=this.now();this.failedAt=0;this.save();if(candidate)this.options.found?.(candidate);}catch{this.failedAt=this.now();this.state.error='暂时无法检查更新，请检查网络后重试';}finally{this.state.checking=false;this.pending=null;this.changed();}})();return this.pending;
 }
 async open(){const url=this.state.candidate?.url;if(url?.startsWith(UPDATE_ROOT+'tag/'))await this.options.open(url)}
}
