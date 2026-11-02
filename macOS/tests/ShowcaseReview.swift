import Cocoa
import WebKit
// Headless review captures of the real production pages in the 晴空 theme, using synthetic lessons only.
// Usage: showcase-review <web-root> <isolated-folder> <screenshot-folder> [light|dark]
@main struct ShowcaseReview {
 static func main(){do{try run()}catch{fputs(error.localizedDescription+"\n",stderr);exit(1)}}
 static func js(_ view:WKWebView,_ source:String)throws->Any?{try smokeEvaluate(view,source)}
 static func wait(_ view:WKWebView,_ condition:String,seconds:Double=20)throws{
  do{try smokeWait({(try? js(view,condition)) as? Bool == true},seconds:seconds)}
  catch{let state=(try? js(view,"JSON.stringify({title:document.querySelector('#pageTitle')?.textContent,errors:window.__smoke?.errors})")) as? String ?? "none";throw appError("Wait failed: "+condition+" state: "+state)}
 }
 static func settle(_ seconds:Double=0.5){RunLoop.current.run(until:Date().addingTimeInterval(seconds))}
 static func shot(_ view:WKWebView,_ path:URL,scale:CGFloat=2)throws{
  var done=false,png:Data?,failure:Error?;let options=WKSnapshotConfiguration();options.afterScreenUpdates=true
  options.snapshotWidth=NSNumber(value:Double(view.bounds.width*scale))
  view.takeSnapshot(with:options){image,error in
   if let image=image,let tiff=image.tiffRepresentation,let bitmap=NSBitmapImageRep(data:tiff){png=bitmap.representation(using:.png,properties:[:])}else{failure=error};done=true}
  try smokeWait({done});if let error=failure{throw error};guard let png=png else{throw appError("No capture")};try png.write(to:path);print("captured "+path.lastPathComponent)
 }
 static func click(_ view:WKWebView,_ selector:String,text:String)throws{
  let ok=try js(view,"(()=>{const n=[...document.querySelectorAll('"+selector+"')].find(n=>n.textContent.trim().startsWith('"+text+"'));if(!n)return false;n.click();return true})()") as? Bool
  guard ok==true else{throw appError("No control: "+selector+" "+text)}
 }
 static func run()throws{
  let args=CommandLine.arguments;guard args.count>=4 else{throw appError("Usage: showcase-review <web-root> <isolated-folder> <screenshot-folder> [light|dark]")}
  let root=URL(fileURLWithPath:args[1]),temporary=URL(fileURLWithPath:args[2]),output=URL(fileURLWithPath:args[3]),mode=args.count>4 ? args[4]:"light"
  try FileManager.default.createDirectory(at:output,withIntermediateDirectories:true)
  let application=NSApplication.shared;application.setActivationPolicy(.prohibited)
  let app=App();app.testSkipCookiePersistence=true;app.root=temporary.appendingPathComponent("isolated-profile")
  app.testDialogResponder={kind,_,_ in kind=="confirm" ? "true":nil}
  let suite="showcase-review-"+UUID().uuidString;app.themeDefaults=UserDefaults(suiteName:suite)!
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
  // Five synthetic lessons over the last three days so the lists read like a real fortnight.
  let extra:[(String,String,String,Int,String)]=[("synthetic-visual","视觉文化导论","陈老师",-86400+14*3600,"紫金港西1-305"),("synthetic-media","传播学概论","李老师",-2*86400+8*3600,"紫金港东6-208"),("synthetic-data","数据新闻实务","王老师",-2*86400+13*3600+1800,"紫金港西2-112"),("synthetic-ethics","媒介伦理","赵老师",-3*86400+10*3600,"紫金港东1-401")]
  var bridge=WebKitAppSmoke.mockBridge(course:course)
  // A synthetic personal key lets the assistant run the scripted fixture conversation.
  bridge=bridge.replacingOccurrences(of:"secret=authorizationScenario?'sk-synthetic-saved-only-key-123456':''",with:"secret='sk-synthetic-saved-only-key-123456'")
  bridge=bridge.replacingOccurrences(of:"aiProvider:'campus'",with:"aiProvider:'auto'")
  let seedExtra=extra.map{"{...course,courseId:'\($0.0)',subId:'\($0.0)-lesson',title:'\($0.1)',teacher:'\($0.2)',room:'\($0.4)',start:\(day+$0.3),end:\(day+$0.3+5400)}"}.joined(separator:",")
  let rawExtra=extra.map{"{...raw,id:'\($0.0)-lesson',sub_id:'\($0.0)-lesson',course_id:'\($0.0)',title:'\($0.1)',course_title:'\($0.1)',teacher_name:'\($0.2)',realname:'\($0.2)',room_name:'\($0.4)',start_at:\(day+$0.3),end_at:\(day+$0.3+5400),course_begin:\(day+$0.3),course_over:\(day+$0.3+5400)}"}.joined(separator:",")
  bridge=bridge.replacingOccurrences(of:"seed('courses.json',[course]);",with:"seed('courses.json',[course,"+seedExtra+"]);")
  bridge=bridge.replacingOccurrences(of:"course:[raw]",with:"course:[raw,"+rawExtra+"]")
  let server=SmokeServer(app:app,root:root,video:temporary.appendingPathComponent("unused.mp4"),bridge:bridge);var ready=false
  try server.start{app.origin=server.origin;view.load(URLRequest(url:URL(string:server.origin+"/fixture/index.html")!));ready=true}
  try smokeWait({ready});try wait(view,"!!document.querySelector('.classroom-page') && !!window.__smoke")
  // Hidden windows freeze CSS animations at their first frame; captures show settled states instead.
  _=try js(view,"(()=>{const s=document.createElement('style');s.textContent='*,*::before,*::after{animation:none!important;transition:none!important}';document.head.append(s)})();void 0")
  app.applyTheme("collage",persist:false);app.applyAppearanceMode(mode,persist:false)
  try wait(view,"document.documentElement.dataset.theme==='collage'")
  let p=mode=="dark" ? "dark-":""
  // Home: recent fortnight, today, all courses.
  try click(view,".classroom-tabs button",text:"近两周");try wait(view,"document.querySelectorAll('.classroom-page .course-card').length>=3");settle(0.8)
  try shot(view,output.appendingPathComponent(p+"01-home-recent.png"))
  try click(view,".classroom-tabs button",text:"今日课表");settle(0.8);try shot(view,output.appendingPathComponent(p+"02-home-today.png"))
  try click(view,".classroom-tabs button",text:"所有课程");settle(1.0);try shot(view,output.appendingPathComponent(p+"03-home-all.png"))
  if mode=="light"{
   for (index,name) in ["课程收藏","稍后再看","离线课程","笔记管理","课程广场","缓存设置"].enumerated(){
    try click(view,"#navigation button",text:name);settle(0.9);try shot(view,output.appendingPathComponent(String(format:"%02d",4+index)+"-nav-"+name+".png"))
   }
   app.event("toolbarAction","theme");settle(1.0);try shot(view,output.appendingPathComponent("10-appearance.png"))
   app.event("toolbarAction","privacy");settle(0.8);try shot(view,output.appendingPathComponent("11-privacy.png"))
   _=try js(view,"document.querySelector('#modalBody').scrollTop=document.querySelector('#modalBody').scrollHeight;void 0");settle(0.5);try shot(view,output.appendingPathComponent("11b-privacy-agent.png"))
   _=try js(view,"document.querySelector('#modalClose')?.click();void 0");settle(0.4)
   app.event("toolbarAction","home");try wait(view,"!!document.querySelector('.classroom-page')");settle(0.6)
   try click(view,".classroom-tabs button",text:"近两周");settle(0.6)
   app.event("toolbarAction","agent");try wait(view,"!!document.querySelector('.global-agent:not([hidden])')");settle(0.8)
   try shot(view,output.appendingPathComponent("12-agent-home.png"))
   _=try js(view,"document.querySelector('.agent-head button[title=收起]')?.click();void 0");settle(0.4)
  }
  // Study page with all six panes from the fixture preferences.
  try click(view,".classroom-tabs button",text:"近两周");try wait(view,"document.querySelectorAll('.classroom-page .lesson-row').length>=3");settle(1.0)
  _=try js(view,"[...document.querySelectorAll('.course-card')].find(n=>n.querySelector('h3')?.textContent==='设计心理学').querySelector('.primary').click();void 0")
  try wait(view,"!!document.querySelector('#stage .parity-pane') && !!document.querySelector('.notes-editor')",seconds:45);settle(1.6)
  // The synthetic lesson has no playable video, so the app toasts a load error; that toast is a fixture artifact.
  let hideToast="document.querySelector('#toast')?.classList.remove('show');void 0"
  _=try js(view,hideToast);settle(0.3)
  try shot(view,output.appendingPathComponent(p+"13-study.png"))
  if mode=="light"{
   app.event("toolbarAction","agent");try wait(view,"!!document.querySelector('.global-agent:not([hidden])')");settle(0.6)
   _=try js(view,"(()=>{const t=document.querySelector('.global-agent textarea');t.value='把这节课的核心概念整理成笔记';t.dispatchEvent(new Event('input',{bubbles:true}));t.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));})()")
   settle(3.0);_=try js(view,hideToast);settle(0.3);try shot(view,output.appendingPathComponent("14-study-agent.png"))
   _=try js(view,"document.querySelector('.agent-head button[title=收起]')?.click();void 0");settle(0.4)
   _=try js(view,"[...document.querySelectorAll('#studyTools button')].find(n=>n.title==='概览')?.click();void 0");settle(1.2)
   try shot(view,output.appendingPathComponent("15-overview.png"))
   _=try js(view,"document.querySelector('#modalClose')?.click();void 0");settle(0.4)
   // The appearance page preview: the real homepage at the gallery's 1200×820 size.
   app.event("toolbarAction","home");try wait(view,"!!document.querySelector('.classroom-page')");settle(0.6)
   try click(view,".classroom-tabs button",text:"近两周");settle(0.6)
   window.setContentSize(NSSize(width:1200,height:820));view.setFrameSize(NSSize(width:1200,height:820));settle(0.8)
   try shot(view,output.appendingPathComponent("preview-collage.png"),scale:1)
   window.setContentSize(NSSize(width:1320,height:812));view.setFrameSize(NSSize(width:1320,height:812));settle(0.5)
   app.event("toolbarAction","logout");try wait(view,"!!document.querySelector('.welcome')");settle(0.8)
   try shot(view,output.appendingPathComponent("16-welcome.png"))
  }
  guard !window.isVisible else{throw appError("Review unexpectedly displayed a window")}
  let errors=(try? js(view,"JSON.stringify(window.__smoke.errors)")) as? String ?? "?"
  print("page errors: "+errors)
 }
}
