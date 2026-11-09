#!/usr/bin/env python3
"""Formward 正式库每日原生、加密与COS异机备份；不读取健康行到日志。"""
import os,pathlib,subprocess,datetime,hashlib,json,fcntl,re,time
os.umask(0o077)
root=pathlib.Path('/var/backups/formward-primary')
root.mkdir(mode=0o700,exist_ok=True)
if root.resolve()!=pathlib.Path('/var/backups/formward-primary'):raise RuntimeError('unexpected backup root')
os.chmod(root,0o700)
lock=open(root/'.backup.lock','a')
try:fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
except BlockingIOError:raise SystemExit(0)
stamp=datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
archive=root/('formward-primary-'+stamp+'.dump')
partial=archive.with_suffix('.dump.pending')
try:
 with open(partial,'xb') as output:
  dump=subprocess.run(['runuser','-u','postgres','--','/usr/lib/postgresql/18/bin/pg_dump','--host','/var/run/postgresql','--dbname','formward_primary','--format=custom','--compress=6','--schema=public','--schema=drizzle','--no-owner','--no-acl'],stdout=output,stderr=subprocess.PIPE,timeout=180)
 if dump.returncode:raise RuntimeError('native dump failed')
 check=subprocess.run(['/usr/lib/postgresql/18/bin/pg_restore','--list',str(partial)],capture_output=True,timeout=30)
 if check.returncode or b'TABLE DATA' not in check.stdout:raise RuntimeError('native archive validation failed')
 if archive.exists():raise RuntimeError('backup name collision')
 partial.rename(archive)
 digest=hashlib.file_digest(open(archive,'rb'),'sha256').hexdigest()
 encrypted=pathlib.Path(str(archive)+'.aesgcm')
 seal=subprocess.run(['/opt/node-v24.21.0-linux-x64/bin/node','/usr/local/libexec/formward-backup-crypto.mjs','encrypt',str(archive),str(encrypted)],capture_output=True,text=True,timeout=180)
 if seal.returncode:raise RuntimeError('encrypted backup failed; native copy retained')
 proof={'database':'formward_primary','createdAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'nativeArchive':archive.name,'bytes':archive.stat().st_size,'sha256':digest,'nativeListVerified':True,'encryptedCopy':encrypted.name,'encryption':json.loads(seal.stdout),'fullRestoreForThisDailyRun':False}
 pathlib.Path(str(archive)+'.json').write_text(json.dumps(proof))
 pathlib.Path(str(archive)+'.sha256').write_text(digest+'  '+archive.name+'\n')
 offsite=subprocess.run(['/opt/node-v24.21.0-linux-x64/bin/node','/usr/local/libexec/formward-backup-offsite.mjs','upload',str(encrypted)],capture_output=True,text=True,timeout=240)
 if offsite.returncode:raise RuntimeError('offsite backup failed; native and encrypted copies retained')
 remote=json.loads(offsite.stdout)
 if not remote.get('remoteReadVerified') or remote.get('sha256')!=proof['encryption']['sha256']:raise RuntimeError('offsite backup verification failed')
 proof['offsite']=remote
 pathlib.Path(str(archive)+'.json').write_text(json.dumps(proof))
 # 仅清理本任务命名且超过14天的直接子文件；保留其他资料和目录。
 pattern=re.compile(r'^formward-primary-\d{8}T\d{12}Z\.dump(?:\.aesgcm|\.json|\.sha256)?$')
 cutoff=time.time()-14*86400
 for file in root.iterdir():
  if pattern.fullmatch(file.name) and not file.is_symlink() and file.is_file() and file.stat().st_mtime<cutoff:file.unlink()
 print(json.dumps({'backupSucceeded':True,'nativeListVerified':True,'encrypted':True,'offsiteReadVerified':True,'archive':archive.name,'bytes':proof['bytes']}))
except Exception:
 if partial.exists() and not partial.is_symlink():partial.unlink()
 print(json.dumps({'backupSucceeded':False,'existingBackupsRetained':True}))
 raise SystemExit(1)
