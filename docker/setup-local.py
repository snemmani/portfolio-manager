#!/usr/bin/env python3
"""Seed runtime secrets; credentials are never included in the image."""
import os,json,secrets,shutil,pathlib,sys
root=pathlib.Path(__file__).resolve().parent.parent
private=root/'docker/private'
private.mkdir(mode=0o700,exist_ok=True)
os.chmod(private,0o700)
config=private/'arthapalana.json'
if not config.exists():
    env={}
    for line in (root.parent/'.env').read_text().splitlines():
        if '=' in line and not line.lstrip().startswith('#'):
            key,value=line.split('=',1);env[key.strip()]=value.strip().strip('\"\'')
    data={k:env[k] for k in ('CF_ACCESS_CLIENT_ID','CF_ACCESS_CLIENT_SECRET')}
    data.update(NOCODB_TOKEN=pathlib.Path('/tmp/token.txt').read_text().strip(),RUNNER_SHARED_SECRET=secrets.token_urlsafe(48),ALERT_ENCRYPTION_KEY=secrets.token_urlsafe(48))
    config.write_text(json.dumps(data));os.chmod(config,0o600)
auth=private/'antigravity';auth.mkdir(mode=0o700,exist_ok=True)
source=pathlib.Path.home()/'.gemini/antigravity-cli/antigravity-oauth-token'
if (not (auth/'antigravity-oauth-token').exists() or '--refresh-auth' in sys.argv) and source.exists():
    data=json.loads(source.read_text())
    if data.get('auth_method')!='consumer':raise RuntimeError('An Antigravity account login is required; API keys are not accepted.')
    shutil.copyfile(source,auth/'antigravity-oauth-token');os.chmod(auth/'antigravity-oauth-token',0o600)
runtime=root/'docker/runtime';runtime.mkdir(mode=0o700,exist_ok=True)
binary=shutil.which('agy')
if not (runtime/'agy').exists():
    if not binary:raise RuntimeError('Install and sign into agy before building the app.')
    shutil.copyfile(binary,runtime/'agy');os.chmod(runtime/'agy',0o755)
document_token=private/'documents-token'
if not document_token.exists():
    document_token.write_text(secrets.token_urlsafe(48));os.chmod(document_token,0o600)
print('Private runtime configuration and AGY runtime ready. Account login copied only if present; no credentials printed.')
