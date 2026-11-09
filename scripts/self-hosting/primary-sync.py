#!/usr/bin/env python3
"""使用原 CRON secret 调用本机正式同步入口，不输出上游健康内容。"""
import pathlib,json,urllib.request,urllib.error
config={line.split('=',1)[0]:json.loads(line.split('=',1)[1]) for line in pathlib.Path('/etc/formward/primary.env').read_text().splitlines() if '=' in line}
if config.get('FORMWARD_EXPECTED_DATABASE')!='formward_primary' or config.get('FORMWARD_MAINTENANCE')!='0':raise SystemExit('正式实例尚未开放。')
request=urllib.request.Request('http://127.0.0.1:3200/api/internal/source-sync',headers={'Host':'43.142.148.58','Authorization':'Bearer '+config['CRON_SECRET']})
try:
 with urllib.request.urlopen(request,timeout=75) as response:result=json.load(response)
 print(json.dumps({'garminSyncStatus':result.get('status')}))
 if result.get('status')=='failed':raise SystemExit(1)
except Exception:
 print(json.dumps({'garminSyncStatus':'failed','credentialsNotPrinted':True}));raise SystemExit(1)
