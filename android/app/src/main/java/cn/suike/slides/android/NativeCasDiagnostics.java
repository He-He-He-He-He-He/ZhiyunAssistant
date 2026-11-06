package cn.suike.slides.android;

import java.io.*;
import java.net.*;
import java.nio.channels.FileChannel;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.*;
import javax.net.ssl.SSLException;

/** Allowlisted metadata ONLY. Never accepts exception text, URLs, accounts, or protocol bodies. */
final class NativeCasDiagnostics {
    enum Stage { CONSENT, REVOKE, STORE, ENROLLMENT, SESSION, DISCOVERY, FORM, KEY, CAPTCHA,
        RESERVE, POST, CALLBACK, OAUTH, LANDING, IDENTITY, OFFICIAL_VERIFY, SAVE, COMMIT, CLEANUP }
    enum Kind { ENROLLMENT, AUTOMATIC, ANONYMOUS_PREFLIGHT, INITIALIZATION, STORE_READ, REVOCATION }
    enum Post { NOT_STARTED, MAY_HAVE_BEEN_SENT, RESPONDED }
    enum Result { RUNNING, SUCCESS, FAILED, CANCELLED }
    enum Persistence { MEMORY_ONLY, STORED, FAILED }
    enum Category { NONE, CANCELLED, CONSENT_REQUIRED, AUTHORIZATION, ALREADY_RUNNING,
        STORE_UNAVAILABLE, RESERVATION_UNAVAILABLE, SESSION_UNAVAILABLE, SESSION_CHANGED,
        NOT_FRESH, PROTOCOL_REJECTED, HTTP_FRAMING, HTTP_STATUS, FORM_REJECTED, KEY_REJECTED,
        CAPTCHA_REQUIRED, CAPTCHA_UNRECOGNIZED, IDENTITY_MISMATCH, DNS, TIMEOUT, TLS,
        CONNECT, INTERRUPTED, IO, SECURITY, INVALID_ARGUMENT, QUEUE_REJECTED, RUNTIME_EXCEPTION,
        REPORT_READ_FAILED, REPORT_WRITE_FAILED, AUTHORITY, PATH, QUERY_KEYS, ROUTE,
        RETURN_URL, CODE_SYNTAX, QUERY_SYNTAX, TICKET_SYNTAX, REDIRECT_LOCATION }
    static final class Failure extends IOException {
        final Stage stage; final Category category; final int http;
        Failure(Stage stage, Category category, int http) {
            super(category.name()); this.stage=stage; this.category=category; this.http=code(http);
        }
    }
    static Failure failure(Stage stage,Category category) { return new Failure(stage,category,0); }
    static Failure typed(Throwable e,Stage stage) {
        if(e instanceof Failure) return (Failure)e;
        Category c=e instanceof SSLException?Category.TLS:
            e instanceof UnknownHostException?Category.DNS:
            e instanceof SocketTimeoutException?Category.TIMEOUT:
            e instanceof ConnectException?Category.CONNECT:
            e instanceof InterruptedException || e instanceof java.io.InterruptedIOException?Category.INTERRUPTED:
            e instanceof SecurityException || e instanceof java.security.GeneralSecurityException?Category.SECURITY:
            e instanceof IllegalArgumentException?Category.INVALID_ARGUMENT:
            e instanceof java.util.concurrent.RejectedExecutionException?Category.QUEUE_REJECTED:
            e instanceof ProtocolException?Category.HTTP_FRAMING:
            e instanceof IOException?Category.IO:Category.RUNTIME_EXCEPTION;
        return failure(stage,c); // No getMessage/getCause/class-name/toString, even transiently.
    }
    interface Sink { void write(String safe) throws IOException; }
    private static final Map<String,NativeCasDiagnostics> FILES=new HashMap<>();
    static synchronized NativeCasDiagnostics forFile(File file) {
        String key=file.getAbsolutePath();
        NativeCasDiagnostics existing=FILES.get(key);
        if(existing!=null) return existing;
        NativeCasDiagnostics created=new NativeCasDiagnostics(safe -> {
            File parent=file.getParentFile();
            if(!parent.isDirectory() && !parent.mkdirs()) throw new IOException("report storage");
            File pending=new File(parent,file.getName()+".pending");
            try {
                try(FileOutputStream out=new FileOutputStream(pending)) {
                    out.write(safe.getBytes(StandardCharsets.US_ASCII)); out.getFD().sync();
                }
                Files.move(pending.toPath(),file.toPath(),StandardCopyOption.ATOMIC_MOVE,StandardCopyOption.REPLACE_EXISTING);
                try(FileChannel directory=FileChannel.open(parent.toPath(),StandardOpenOption.READ)) { directory.force(true); }
            } finally { pending.delete(); }
        });
        if(file.exists()) {
            try {
                if(file.length()>4096) throw new IOException("report size");
                created.latest=Report.decode(new String(Files.readAllBytes(file.toPath()),StandardCharsets.US_ASCII));
                created.sequence=created.latest.id;
                if(created.latest.result==Result.RUNNING) {
                    Report r=created.latest;
                    Context interrupted=created.new Context(r.id,r.kind);
                    interrupted.time=r.time; interrupted.stage=r.stage; interrupted.category=Category.INTERRUPTED;
                    interrupted.http=r.http; interrupted.post=r.post; interrupted.postHttp=r.postHttp;
                    interrupted.cleanup=r.cleanup; interrupted.result=Result.FAILED; interrupted.persistence=r.persistence;
                    interrupted.httpCodes.putAll(r.httpCodes);
                    interrupted.visited.clear(); interrupted.visited.addAll(r.visited); created.publish(interrupted);
                }
            } catch(Exception bad) {
                Context c=created.begin(Kind.INITIALIZATION);
                c.stage(Stage.STORE); c.fail(failure(Stage.STORE,Category.REPORT_READ_FAILED));
            }
        }
        FILES.put(key,created); return created;
    }
    static final class Report {
        final long id,time; final Kind kind; final Stage stage; final Category category,cleanup;
        final int http,postHttp; final Post post; final Result result; final Persistence persistence;
        final EnumSet<Stage> visited;
        final EnumMap<Stage,Integer> httpCodes;
        Report(Context c,Persistence persistence) {
            id=c.id; time=c.time; kind=c.kind; stage=c.stage; category=c.category; cleanup=c.cleanup;
            http=c.http; postHttp=c.postHttp; post=c.post; result=c.result; this.persistence=persistence;
            visited=c.visited.clone();
            httpCodes=new EnumMap<>(c.httpCodes);
        }
        String encode() {
            StringJoiner stages=new StringJoiner(",");
            for(Stage s:visited) stages.add(s.name());
            StringJoiner codes=new StringJoiner(",");
            for(Map.Entry<Stage,Integer> e:httpCodes.entrySet()) codes.add(e.getKey().name()+":"+e.getValue());
            return "1|"+id+"|"+time+"|"+kind.name()+"|"+stage.name()+"|"+category.name()+"|"+
                http+"|"+post.name()+"|"+postHttp+"|"+result.name()+"|"+persistence.name()+"|"+cleanup.name()+"|"+stages+"|"+codes;
        }
        static Report decode(String safe) throws IOException {
            try {
                String[] v=safe.split("\\|",-1);
                if(v.length!=14 || !v[0].equals("1") || safe.length()>4096) throw new IOException("report format");
                Context c=new NativeCasDiagnostics().new Context(Long.parseLong(v[1]),Kind.valueOf(v[3]));
                c.time=Long.parseLong(v[2]); c.stage=Stage.valueOf(v[4]); c.category=Category.valueOf(v[5]);
                c.http=Integer.parseInt(v[6]); c.post=Post.valueOf(v[7]); c.postHttp=Integer.parseInt(v[8]);
                c.result=Result.valueOf(v[9]); c.cleanup=Category.valueOf(v[11]); c.visited.clear();
                for(String s:v[12].split(",")) c.visited.add(Stage.valueOf(s));
                if(!v[13].isEmpty()) for(String entry:v[13].split(",")) {
                    String[] pair=entry.split(":",-1);
                    if(pair.length!=2) throw new IOException("report HTTP");
                    int status=Integer.parseInt(pair[1]);
                    if(code(status)!=status || status==0 || c.httpCodes.put(Stage.valueOf(pair[0]),status)!=null)
                        throw new IOException("report HTTP");
                }
                if(c.id<=0 || c.id==Long.MAX_VALUE || c.time<0 || code(c.http)!=c.http || code(c.postHttp)!=c.postHttp)
                    throw new IOException("report bounds");
                return new Report(c,Persistence.valueOf(v[10]));
            } catch(IllegalArgumentException bad) { throw new IOException("report format"); }
        }
        String display() {
            return "安全报告 #"+id+"\n时间(ms)："+time+"\n操作："+kind+"\n阶段："+stage+
                "\nHTTP："+(http==0?"无有效响应":http)+"\n密码 POST："+(post==Post.NOT_STARTED?"未开始":post==Post.MAY_HAVE_BEEN_SENT?"可能已发送":"已响应")+" ("+post+")"+
                "\nPOST HTTP："+(postHttp==0?"无有效响应":postHttp)+"\n结果："+result+
                "\n异常类别："+category+"\n清理类别："+cleanup+"\n报告保存："+persistence+
                "\n已进入阶段："+visited+
                "\n各阶段最后请求 HTTP："+httpCodes+
                "\n仅含固定枚举及数字；不含账号、密码、Cookie、URL 或令牌。报告不授予或恢复认证额度。"+
                (persistence==Persistence.FAILED?"\n报告落盘失败（REPORT_WRITE_FAILED）；当前仅内存可读，重启可能丢失。":"");
        }
    }
    final class Context {
        final long id; final Kind kind; long time=System.currentTimeMillis();
        Stage stage=Stage.CONSENT; Category category=Category.NONE,cleanup=Category.NONE;
        int http,postHttp; Post post=Post.NOT_STARTED; Result result=Result.RUNNING;
        Persistence persistence=Persistence.MEMORY_ONLY;
        final EnumSet<Stage> visited=EnumSet.of(Stage.CONSENT);
        final EnumMap<Stage,Integer> httpCodes=new EnumMap<>(Stage.class);
        Context(long id,Kind kind) { this.id=id; this.kind=kind; }
        Stage currentStage() { synchronized(NativeCasDiagnostics.this) { return stage; } }
        void stage(Stage value) { synchronized(NativeCasDiagnostics.this) {
            if(result!=Result.RUNNING) return; stage=value; http=0; visited.add(value); publish(this);
        } }
        void http(int value) { synchronized(NativeCasDiagnostics.this) {
            if(result!=Result.RUNNING) return; http=code(value);
            if(http!=0) httpCodes.put(stage,http); else httpCodes.remove(stage);
            publish(this);
        } }
        void postStarted() { synchronized(NativeCasDiagnostics.this) {
            if(result!=Result.RUNNING) return; if(post==Post.NOT_STARTED) post=Post.MAY_HAVE_BEEN_SENT; publish(this);
        } }
        void postResponded(int status) { synchronized(NativeCasDiagnostics.this) {
            if(result!=Result.RUNNING) return; post=Post.RESPONDED; postHttp=code(status); http=postHttp;
            if(postHttp!=0) httpCodes.put(Stage.POST,postHttp); publish(this);
        } }
        void fail(Throwable error) { synchronized(NativeCasDiagnostics.this) {
            if(result!=Result.RUNNING) return;
            Failure f=typed(error,stage); stage=f.stage; visited.add(stage); category=f.category;
            if(f.http!=0) { http=f.http; httpCodes.put(stage,http); }
            result=category==Category.CANCELLED?Result.CANCELLED:Result.FAILED; publish(this);
        } }
        void success() { synchronized(NativeCasDiagnostics.this) {
            if(result!=Result.RUNNING) return; result=Result.SUCCESS; publish(this);
        } }
        void cleanup(Throwable error) { synchronized(NativeCasDiagnostics.this) {
            cleanup=typed(error,Stage.CLEANUP).category; publish(this);
        } }
    }
    private final Sink sink; private long sequence; private Report latest;
    NativeCasDiagnostics() { this(null); }
    NativeCasDiagnostics(Sink sink) { this.sink=sink; }
    synchronized Context begin(Kind kind) {
        Context c=new Context(++sequence,kind); publish(c); return c;
    }
    synchronized Report latest() { return latest; }
    synchronized long revision() { return sequence; }
    synchronized void failIfCurrent(long revision,Kind kind,Stage stage,Throwable error) {
        if(revision!=sequence) return;
        Context c=begin(kind); c.stage(stage); c.fail(error);
    }
    synchronized String display() {
        return latest==null?"尚无原生安全报告。旧版本未记录的失败无法恢复；查看此页不会联网或重试认证。":latest.display();
    }
    private void publish(Context c) {
        if(c.id!=sequence) return; // Old cancellation, completion and close cannot overwrite a newer operation.
        if(sink!=null) {
            Persistence desired=c.persistence==Persistence.FAILED?Persistence.FAILED:Persistence.STORED;
            try { sink.write(new Report(c,desired).encode()); c.persistence=desired; }
            catch(Exception unavailable) { c.persistence=Persistence.FAILED; }
        }
        latest=new Report(c,c.persistence);
    }
    private static int code(int value) { return value>=100 && value<=599?value:0; }
}
