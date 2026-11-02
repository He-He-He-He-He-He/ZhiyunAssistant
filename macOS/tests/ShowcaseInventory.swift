import Cocoa
import WebKit
// Headless inventory of every page, dialog and control state in the 晴空 theme, with synthetic lessons only.
// Usage: showcase-inventory <web-root> <isolated-folder> <screenshot-folder> [light|dark]
@main struct ShowcaseInventory {
 static func main(){do{try run()}catch{fputs(error.localizedDescription+"\n",stderr);exit(1)}}
 static func js(_ view:WKWebView,_ source:String)throws->Any?{try smokeEvaluate(view,source)}
 static func wait(_ view:WKWebView,_ condition:String,seconds:Double=12)throws{
  do{try smokeWait({(try? js(view,condition)) as? Bool == true},seconds:seconds)}catch{throw appError("Wait failed: "+condition)}
 }
 static func settle(_ seconds:Double=0.5){RunLoop.current.run(until:Date().addingTimeInterval(seconds))}
 static func shot(_ view:WKWebView,_ path:URL)throws{
  var done=false,png:Data?,failure:Error?;let options=WKSnapshotConfiguration();options.afterScreenUpdates=true
  options.snapshotWidth=NSNumber(value:Double(view.bounds.width*2))
  view.takeSnapshot(with:options){image,error in
   if let image=image,let tiff=image.tiffRepresentation,let bitmap=NSBitmapImageRep(data:tiff){png=bitmap.representation(using:.png,properties:[:])}else{failure=error};done=true}
  try smokeWait({done});if let error=failure{throw error};guard let png=png else{throw appError("No capture")};try png.write(to:path);print("captured "+path.lastPathComponent)
 }
 static func run()throws{
  let args=CommandLine.arguments;guard args.count>=4 else{throw appError("Usage: showcase-inventory <web-root> <isolated-folder> <screenshot-folder> [light|dark]")}
  let root=URL(fileURLWithPath:args[1]),temporary=URL(fileURLWithPath:args[2]),output=URL(fileURLWithPath:args[3]),mode=args.count>4 ? args[4]:"light"
  try FileManager.default.createDirectory(at:output,withIntermediateDirectories:true)
  let application=NSApplication.shared;application.setActivationPolicy(.prohibited)
  let app=App();app.testSkipCookiePersistence=true;app.root=temporary.appendingPathComponent("isolated-profile")
  app.testDialogResponder={kind,_,_ in kind=="confirm" ? "true":kind=="prompt" ? "第二篇笔记":nil}
  let suite="showcase-inventory-"+UUID().uuidString;app.themeDefaults=UserDefaults(suiteName:suite)!
  defer{app.themeDefaults.removePersistentDomain(forName:suite)}
  app.themeDefaults.set("collage",forKey:"appearanceTheme");app.themeDefaults.set(mode,forKey:"appearanceMode")
  let config=WKWebViewConfiguration();config.websiteDataStore=app.store;config.mediaTypesRequiringUserActionForPlayback=[];config.userContentController.add(app,name:"native")
  config.userContentController.addUserScript(WKUserScript(source:"window.__zhiyunTheme='collage';window.__zhiyunMode='"+mode+"';",injectionTime:.atDocumentStart,forMainFrameOnly:true))
  let size=NSRect(x:0,y:0,width:1320,height:812)
  let view=WKWebView(frame:size,configuration:config);view.navigationDelegate=app;view.uiDelegate=app
  let window=NSWindow(contentRect:size,styleMask:[.titled],backing:.buffered,defer:false);window.contentView=view;window.isReleasedWhenClosed=false;app.window=window;app.web=view;app.token="fixture"
  window.appearance=NSAppearance(named:mode=="dark" ? .darkAqua:.aqua)
  var shanghai=Calendar(identifier:.gregorian);shanghai.timeZone=TimeZone(identifier:"Asia/Shanghai")!
  let day=Int(shanghai.startOfDay(for:Date()).timeIntervalSince1970),start=day-86400+8*3600
  let course:[String:Any]=["courseId":"synthetic-design","subId":"synthetic-design-lesson","title":"设计心理学","teacher":"演示教师","room":"紫金港东2-201","term":"2026—2027学年 · 秋季学期","start":start,"end":start+5400,"status":"3"]
  let extra:[(String,String,String,Int,String)]=[("synthetic-visual","视觉文化导论","陈老师",-86400+14*3600,"紫金港西1-305"),("synthetic-media","传播学概论","李老师",-2*86400+8*3600,"紫金港东6-208"),("synthetic-data","数据新闻实务","王老师",-2*86400+13*3600+1800,"紫金港西2-112"),("synthetic-ethics","媒介伦理","赵老师",-3*86400+10*3600,"紫金港东1-401")]
  var bridge=WebKitAppSmoke.mockBridge(course:course)
  bridge=bridge.replacingOccurrences(of:"secret=authorizationScenario?'sk-synthetic-saved-only-key-123456':''",with:"secret='sk-synthetic-saved-only-key-123456'")
  bridge=bridge.replacingOccurrences(of:"aiProvider:'campus'",with:"aiProvider:'auto'")
  let seedExtra=extra.map{"{...course,courseId:'\($0.0)',subId:'\($0.0)-lesson',title:'\($0.1)',teacher:'\($0.2)',room:'\($0.4)',start:\(day+$0.3),end:\(day+$0.3+5400)}"}.joined(separator:",")
  let rawExtra=extra.map{"{...raw,id:'\($0.0)-lesson',sub_id:'\($0.0)-lesson',course_id:'\($0.0)',title:'\($0.1)',course_title:'\($0.1)',teacher_name:'\($0.2)',realname:'\($0.2)',room_name:'\($0.4)',start_at:\(day+$0.3),end_at:\(day+$0.3+5400),course_begin:\(day+$0.3),course_over:\(day+$0.3+5400)}"}.joined(separator:",")
  bridge=bridge.replacingOccurrences(of:"seed('courses.json',[course]);",with:"seed('courses.json',[course,"+seedExtra+"]);")
  bridge=bridge.replacingOccurrences(of:"course:[raw]",with:"course:[raw,"+rawExtra+"]")
  try createSmokeVideo(temporary.appendingPathComponent("video.mp4"))
  let server=SmokeServer(app:app,root:root,video:temporary.appendingPathComponent("video.mp4"),bridge:bridge);var ready=false
  try server.start{app.origin=server.origin;view.load(URLRequest(url:URL(string:server.origin+"/fixture/index.html")!));ready=true}
  try smokeWait({ready});try wait(view,"!!document.querySelector('.classroom-page') && !!window.__smoke",seconds:20)
  // Hidden windows freeze CSS animations at their first frame; captures show settled states.
  _=try js(view,"(()=>{const s=document.createElement('style');s.textContent='*,*::before,*::after{animation:none!important;transition:none!important}';document.head.append(s);window.__find=(sel,text)=>[...document.querySelectorAll(sel)].find(n=>(n.textContent||'').trim().startsWith(text)||n.title===text||n.getAttribute('aria-label')===text);window.__click=(sel,text)=>{const n=window.__find(sel,text);if(!n)return false;n.click();return true}})();void 0")
  app.applyTheme("collage",persist:false);app.applyAppearanceMode(mode,persist:false)
  var n=0,failures=[String]()
  func step(_ name:String,_ action:()throws->Void){
   n+=1;let file=String(format:"%02d-",n)+name+".png"
   do{try action();try shot(view,output.appendingPathComponent(file))}catch{failures.append(name+": "+error.localizedDescription);print("FAILED "+name+": "+error.localizedDescription)}
  }
  func click(_ selector:String,_ text:String)throws{guard try js(view,"window.__click('"+selector+"','"+text+"')") as? Bool == true else{throw appError("no control "+selector+" "+text)}}
  func closeModal(){_=try? js(view,"document.querySelector('#modal:not([hidden]) #modalClose')?.click();void 0");settle(0.3)}
  func home(){app.event("toolbarAction","home");settle(0.6);_=try? js(view,"window.__click('.classroom-tabs button','近两周');void 0");settle(0.6)}
  step("home-recent"){try click(".classroom-tabs button","近两周");settle(0.8)}
  step("batch-download"){try click("#topActions button","批量下载");try wait(view,"!document.querySelector('#modal').hidden");settle(0.6)}
  step("batch-download-started"){_=try js(view,"window.__click('#modal button','全选');void 0");settle(0.3);try click("#modal button","下载所选");settle(1.2)}
  closeModal()
  step("offline-progress"){try click("#navigation button","离线课程");settle(1.0)}
  step("plaza"){try click("#navigation button","课程广场");settle(1.2)}
  step("plaza-calendar"){_=try js(view,"(()=>{const b=[...document.querySelectorAll('#content button,#topActions button')].find(n=>/\\d{4}-\\d{2}-\\d{2}/.test(n.textContent)||n.title==='选择日期');b?.click();return !!b})()");settle(0.8)}
  closeModal()
  step("cache"){try click("#navigation button","缓存设置");settle(0.8)}
  step("appearance"){app.event("toolbarAction","theme");settle(1.0)}
  step("privacy"){app.event("toolbarAction","privacy");settle(0.8)}
  closeModal();home()
  step("agent-empty"){app.event("toolbarAction","agent");try wait(view,"!!document.querySelector('.global-agent:not([hidden])')");settle(0.6)}
  step("agent-settings"){_=try js(view,"document.querySelector('.agent-head button[title=设置]')?.click();void 0");settle(0.8)}
  step("agent-history"){_=try js(view,"document.querySelector('.agent-settings-footer button')?.click();void 0");settle(0.3);_=try js(view,"document.querySelector('.agent-head button[title=历史]')?.click();void 0");settle(0.8)}
  _=try? js(view,"document.querySelector('.agent-back')?.click();document.querySelector('.agent-head button[title=收起]')?.click();void 0");settle(0.4)
  // Study page.
  _=try? js(view,"[...document.querySelectorAll('.course-card')].find(n=>n.querySelector('h3')?.textContent==='设计心理学')?.querySelector('.primary')?.click();void 0")
  try wait(view,"!!document.querySelector('#stage .parity-pane') && !!document.querySelector('.notes-editor')",seconds:45);settle(1.6)
  step("study"){}
  step("study-notes-filled"){
   _=try js(view,"(()=>{const e=document.querySelector('.notes-editor');e.focus();const block=e.querySelector('[contenteditable=true]')||e;block.focus();document.execCommand('insertText',false,'课堂要点：设计心理学关注人如何理解界面。');})();void 0");settle(0.5)
   _=try js(view,"(()=>{const img=document.querySelector('.parity-pane[data-pane=slides] .slide-image');img?.dispatchEvent(new MouseEvent('pointerdown',{bubbles:true}));img?.dispatchEvent(new MouseEvent('pointerup',{bubbles:true}));img?.click();})();void 0");settle(0.6)
   _=try js(view,"(()=>{const b=document.querySelector('.insert-action, .parity-selection-insert');b?.click();return !!b})()");settle(0.8)
   // The synthetic slide is not a PNG, so the mock bridge refuses the image and the app toasts; that toast is a fixture artifact.
   _=try js(view,"document.querySelector('#toast')?.classList.remove('show');void 0");settle(0.3)
   _=try js(view,"(()=>{const line=document.querySelector('.caption-line');if(!line)return false;const r=document.createRange();r.selectNodeContents(line.querySelector('.caption-text')||line);const s=getSelection();s.removeAllRanges();s.addRange(r);line.dispatchEvent(new MouseEvent('mouseup',{bubbles:true}));document.dispatchEvent(new Event('selectionchange'));return true})()");settle(0.8)
   _=try js(view,"(()=>{const b=document.querySelector('.parity-selection-insert, .selection-insert');b?.click();return !!b})()");settle(0.8)
  }
  step("question-answer"){
   _=try js(view,"(()=>{const pane=document.querySelector('.parity-pane[data-pane=question]');const t=pane.querySelector('textarea');t.focus();t.value='这一页的核心概念是什么？';t.dispatchEvent(new Event('input',{bubbles:true}));t.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));})();void 0");settle(2.0)
  }
  step("video-playing"){_=try js(view,"(()=>{const v=document.querySelector('video');v?.play?.();document.querySelector('.video-controls button')?.click();})();void 0");settle(1.6)}
  step("video-speed"){_=try js(view,"document.querySelector('#videoSpeed')?.click();void 0");settle(0.6)}
  _=try? js(view,"document.querySelector('#videoSpeed')?.click();document.querySelector('video')?.pause?.();void 0");settle(0.3)
  step("learning-settings"){_=try js(view,"document.querySelector('#topActions button[title=设置]')?.click();void 0");try wait(view,"!document.querySelector('#modal').hidden");settle(0.6)}
  closeModal()
  step("layout"){_=try js(view,"document.querySelector('#topActions button[title=布局]')?.click()||window.__click('#studyTools button','布局');void 0");settle(0.8)}
  closeModal()
  step("time-jump"){try click("#studyTools button","跳转时间");settle(0.8)}
  closeModal()
  step("overview"){try click("#studyTools button","概览");settle(1.0)}
  closeModal()
  step("note-export"){_=try js(view,"document.querySelector('.parity-pane[data-pane=notes] .pane-header button[title=导出]')?.click();void 0");settle(0.8)}
  closeModal()
  step("note-colors"){_=try js(view,"window.__click('.parity-pane[data-pane=notes] .formatbar button','颜色');void 0");settle(0.8)}
  closeModal()
  step("api-settings"){_=try js(view,"document.querySelector('.parity-pane[data-pane=question] .pane-header button[title=API设置]')?.click();void 0");settle(0.8)}
  closeModal()
  step("slide-fullscreen"){_=try js(view,"document.querySelector('.parity-pane[data-pane=slides] .slide-image')?.dispatchEvent(new MouseEvent('dblclick',{bubbles:true}));void 0");settle(1.0)}
  closeModal()
  step("study-agent-run"){
   app.event("toolbarAction","agent");try wait(view,"!!document.querySelector('.global-agent:not([hidden])')");settle(0.4)
   _=try js(view,"(()=>{const t=document.querySelector('.global-agent textarea');t.value='把这节课的核心概念整理成笔记';t.dispatchEvent(new Event('input',{bubbles:true}));t.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));})()");settle(3.0)
   _=try js(view,"document.querySelector('.agent-progress > summary')?.click();void 0");settle(0.5)
  }
  _=try? js(view,"document.querySelector('.agent-head button[title=收起]')?.click();void 0");settle(0.4)
  step("toast"){_=try js(view,"(()=>{const t=document.querySelector('#toast');t.textContent='已插入笔记';t.classList.add('show');t.style.opacity='1';})();void 0");settle(0.3)}
  // Library pages once notes exist.
  app.event("toolbarAction","home");settle(0.8)
  step("note-manager"){try click("#navigation button","笔记管理");settle(1.0)}
  step("favourites-empty"){try click("#navigation button","课程收藏");settle(0.8)}
  step("welcome"){app.event("toolbarAction","logout");try wait(view,"!!document.querySelector('.welcome')");settle(0.8)}
  print("failures: "+String(failures.count));for f in failures{print("  "+f)}
  guard !window.isVisible else{throw appError("Inventory unexpectedly displayed a window")}
 }
}
