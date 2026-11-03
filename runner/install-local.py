#!/usr/bin/env python3
"""Install the user-owned runner; connection credentials arrive on hidden stdin."""
import json,os,pathlib,shutil,sys,termios
project=pathlib.Path(__file__).resolve().parent.parent
private=project/'.runner-private';private.mkdir(exist_ok=True,mode=0o700);private.chmod(0o700)
attrs=termios.tcgetattr(sys.stdin.fileno());attrs[3]&=~termios.ECHO;termios.tcsetattr(sys.stdin.fileno(),termios.TCSANOW,attrs)
print('Ready for runner connection JSON on stdin (hidden).',flush=True)
data=json.loads(sys.stdin.readline())
if not data.get('sharedSecret') or not data.get('siteBearer'):raise SystemExit('Missing private Site connection')
fd=os.open(private/'connection.json',os.O_WRONLY|os.O_CREAT|os.O_TRUNC,0o600)
with os.fdopen(fd,'w') as f:json.dump(data,f)
(private/'connection.json').chmod(0o600)
runtime=project/'.runner-runtime/bin';runtime.mkdir(parents=True,exist_ok=True)
shutil.copyfile('/tmp/node-v22.16.0-linux-x64/bin/node',runtime/'node');(runtime/'node').chmod(0o755)
unit=pathlib.Path.home()/'.config/systemd/user/arthapalana-codex-runner.service';unit.parent.mkdir(parents=True,exist_ok=True)
unit.write_text(f'''[Unit]
Description=Arthapalana subscription-only Codex research runner
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory={project}
ExecStart={runtime}/node {project}/runner/index.mjs
Environment=PATH={runtime}:/home/snemmani/.local/bin:/usr/local/bin:/usr/bin:/bin
Restart=on-failure
RestartSec=15
UMask=0077
NoNewPrivileges=true
KillMode=control-group
TimeoutStopSec=30

[Install]
WantedBy=default.target
''')
print('Installed protected local connection, persistent Node runtime and user service. Credentials were not printed.',flush=True)
