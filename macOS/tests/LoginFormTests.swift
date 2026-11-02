import Cocoa
import WebKit
final class FormReady:NSObject,WKNavigationDelegate{var done=false;func webView(_ webView:WKWebView,didFinish navigation:WKNavigation!){done=true}}
@main struct LoginFormTests{
 static func wait(_ condition:()->Bool)throws{let until=Date().addingTimeInterval(10);while !condition(),Date()<until{RunLoop.current.run(until:Date().addingTimeInterval(0.01))};if !condition(){throw appError("Local login fixture timed out")}}
 static func main()throws{
  NSApplication.shared.setActivationPolicy(.prohibited)
  var checks=0
  let form="<form id='fm1' method='post' action='/cas/login'><input id='username' name='username'><input id='password' name='password' type='password'><input id='rember' name='rememberMe' type='checkbox'><div id='kaptcha' style='display:none;width:30px;height:30px'></div><div id='errormsg'></div><button type='button' id='dl' onclick='window.submissions=(window.submissions||0)+1'>Login</button></form>"
  for (html,origin,expected) in [(form,"https://zjuam.zju.edu.cn/cas/login","submitted"),(form,"https://foreign.invalid/cas/login","wrong-origin"),(form.replacingOccurrences(of:"action='/cas/login'",with:"action='https://foreign.invalid/cas/login'"),"https://zjuam.zju.edu.cn/cas/login","wrong-action"),(form.replacingOccurrences(of:"display:none",with:"display:block"),"https://zjuam.zju.edu.cn/cas/login","needs-user"),(form.replacingOccurrences(of:"id='errormsg'></div>",with:"id='errormsg'>Synthetic rejection</div>"),"https://zjuam.zju.edu.cn/cas/login","needs-user")]{
   let config=WKWebViewConfiguration();config.websiteDataStore = .nonPersistent();let view=WKWebView(frame:NSRect(x:0,y:0,width:800,height:600),configuration:config),ready=FormReady();view.navigationDelegate=ready
   view.loadHTMLString(html,baseURL:URL(string:origin));try wait({ready.done})
   var complete=false,result:String?,failure:Error?
   view.callAsyncJavaScript(officialLoginJavaScript,arguments:["username":"synthetic-user","password":"synthetic-password"],in:nil,in:.page){r in switch r{case .success(let value):result=value as? String;case .failure(let error):failure=error};complete=true};try wait({complete})
   guard failure==nil,result==expected else{throw appError("Login fixture expected "+expected+", got "+(result ?? "JS error"))};checks+=1
   complete=false
   view.evaluateJavaScript("({count:window.submissions||0,remember:!!document.querySelector('#rember')?.checked,password:document.querySelector('#password')?.value||''})"){v,_ in
    if let row=v as? [String:Any]{precondition((row["count"] as? Int ?? 0)==(expected=="submitted" ? 1:0));if expected=="submitted"{precondition(row["remember"] as? Bool==true)}else{precondition((row["password"] as? String ?? "").isEmpty)}}else{preconditionFailure("Fixture inspection failed")};complete=true
   };try wait({complete});checks+=1
   if expected=="submitted"{complete=false;view.callAsyncJavaScript(officialLoginJavaScript,arguments:["username":"synthetic-user","password":"synthetic-password"],in:nil,in:.page){r in if case .success(let v)=r{precondition(v as? String=="already-submitted")}else{preconditionFailure("Duplicate guard failed")};complete=true};try wait({complete});checks+=1}
   view.stopLoading();view.navigationDelegate=nil
  }
  print("Local official-login form checks passed:",checks)
 }
}
