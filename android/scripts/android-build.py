#!/usr/bin/env python3
"""Build and sign APKs. Local secrets are never stored in the project or command-line args."""
import argparse, hashlib, json, os, pathlib, subprocess, re, tempfile

project = pathlib.Path(__file__).resolve().parent.parent
version = re.search(r"versionName\s+'([^']+)'", (project/'app/build.gradle').read_text()).group(1)
if not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9._-]{1,63}', version): raise ValueError('Invalid version name')
parser = argparse.ArgumentParser()
parser.add_argument('--debug', action='store_true')
parser.add_argument('--unsigned', action='store_true')
parser.add_argument('--instrumentation', action='store_true', help='Build a separately signed, same-key native test APK; never publish this artifact.')
parser.add_argument('--offline', action='store_true', help='Use only the existing Gradle dependency cache.')
parser.add_argument('--acceptance', action='store_true', help='Non-debuggable release code, existing local debug certificate, separate acceptance name; NEVER publish.')
parser.add_argument('--baseline-apk', type=pathlib.Path, help='Require the signed APK to match this existing local release certificate.')
args = parser.parse_args()
if args.acceptance and (args.debug or args.unsigned or args.instrumentation):
    parser.error('--acceptance requires a signed non-debuggable release build')
tools = pathlib.Path(os.environ.get('ZHIYUN_ANDROID_TOOLS', str(pathlib.Path.home() / 'Library/Android/zhiyun-tools')))
sdk = pathlib.Path(os.environ.get('ANDROID_HOME', str(tools / 'sdk')))
java = os.environ.get('JAVA_HOME') or str(next((tools/'jdk17').glob('*/Contents/Home')))
env = dict(os.environ, JAVA_HOME=java, ANDROID_HOME=str(sdk), ANDROID_SDK_ROOT=str(sdk))
gradle = tools/'gradle-8.13/bin/gradle'
if not gradle.exists(): gradle = project/'gradlew'
kind = 'debug' if args.debug or args.instrumentation else 'release'
task = ':app:assembleDebugAndroidTest' if args.instrumentation else ':app:assemble' + kind.capitalize()
command = [str(gradle), task, '--no-daemon']
if args.offline: command.append('--offline')
subprocess.run(command, cwd=project, env=env, check=True)
apk = project/'app/build/outputs/apk'/kind/('app-debug.apk' if args.debug else 'app-release-unsigned.apk')
if args.instrumentation: apk = project/'app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk'
if args.unsigned:
    print(apk)
    raise SystemExit(0)
config = pathlib.Path(os.environ.get('ZHIYUN_ANDROID_SIGNING', str(pathlib.Path.home()/'.codex/android-signing/cn.suike.slides.android.credentials.json')))
destination = project/'dist'
destination.mkdir(exist_ok=True)
output = destination/('ZhiyunAssistant-' + version + '-Android' + ('-acceptance' if args.acceptance else '-tests' if args.instrumentation else '-debug' if args.debug else '') + '.apk')
buildtools = sdk/'build-tools/36.0.0'
def certificate(path):
    # Capture public certificate metadata; print only its digest, not the subject/alias.
    result = subprocess.run([str(buildtools/'apksigner'),'verify','--print-certs',str(path)],
                            check=True, env=env, capture_output=True, text=True)
    digests = re.findall(r'^Signer #\d+ certificate SHA-256 digest: ([0-9a-fA-F]{64})$', result.stdout, re.M)
    if len(digests) != 1: raise ValueError('Expected exactly one verified APK signer')
    return digests[0].lower()
if args.baseline_apk and args.baseline_apk.resolve() == output.resolve():
    raise ValueError('Baseline must be an independent existing APK')
baseline = certificate(args.baseline_apk) if args.baseline_apk else None
if args.acceptance:
    # Standard Android debug-key defaults, not a new key or a copied personal credential.
    secret={'keystore':str(pathlib.Path.home()/'.android/debug.keystore'),'alias':'androiddebugkey','password':'android'}
else:
    secret = json.loads(config.read_text())
env['ZHIYUN_KEYSTORE_PASSWORD'] = secret['password']
try:
    with tempfile.TemporaryDirectory(prefix='.signing-', dir=destination) as temporary:
        unsigned = pathlib.Path(temporary)/'aligned.apk'
        signed = pathlib.Path(temporary)/'signed.apk'
        subprocess.run([str(buildtools/'zipalign'), '-f','-p','4',str(apk),str(unsigned)], check=True, env=env)
        subprocess.run([str(buildtools/'apksigner'),'sign','--ks',secret['keystore'],'--ks-key-alias',secret['alias'],
                        '--ks-pass','env:ZHIYUN_KEYSTORE_PASSWORD','--key-pass','env:ZHIYUN_KEYSTORE_PASSWORD',
                        '--out',str(signed),str(unsigned)], check=True, env=env)
        actual = certificate(signed)
        if kind == 'release' and actual != 'aa8632ac2a50e36214b77dee1dcd7029b56e8717dda020c40c334b73c1d750a8':
            if not args.acceptance or actual != 'ef7f41fb43f810a9eefa34848f3801c20f97554b1682abd546c99788d9d6b08b':
                raise ValueError('Public Release must use the established production certificate, never an acceptance/debug key')
        elif args.acceptance:
            raise ValueError('Acceptance must match the known installed acceptance certificate')
        badging=subprocess.run([str(buildtools/'aapt'),'dump','badging',str(signed)],check=True,env=env,capture_output=True,text=True).stdout
        if kind=='release' and 'application-debuggable' in badging:
            raise ValueError('Release/acceptance APK must not be debuggable')
        if baseline is not None and actual != baseline: raise ValueError('APK signing certificate does not match local baseline')
        subprocess.run([str(buildtools/'zipalign'),'-c','-p','4',str(signed)], check=True, env=env)
        os.replace(signed,output)
finally:
    env.pop('ZHIYUN_KEYSTORE_PASSWORD',None)
    secret.clear()
print('CERTIFICATE_SHA256: '+actual)
if baseline: print('BASELINE_CERTIFICATE_MATCH: true')
print('APK: '+str(output))
print('SHA256: '+hashlib.sha256(output.read_bytes()).hexdigest())
