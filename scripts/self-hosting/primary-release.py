"""正式上海主库的发布步骤。构建完成后，将验收通过的同一运行包装载到正式服务。"""

import argparse
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
import gzip
import hashlib
import json
import os
from pathlib import Path
import pwd
import re
import shutil
import socket
import subprocess
import tarfile
import time
from urllib.parse import urlsplit
from urllib.request import Request, urlopen

PRIMARY = Path("/srv/formward-primary")
STATE = Path("/var/lib/formward")
BUILD_HOME = Path("/home/ubuntu")
BACKUPS = Path("/var/backups/formward-primary")
ENV_FILE = Path("/etc/formward/primary.env")
PROC = Path("/proc")
NODE = "/opt/node-v24.21.0-linux-x64/bin/node"
GATE = "/usr/local/libexec/formward-check-security-baseline.mjs"
UNITS = ("formward-primary", "formward-chat-worker")
SMOKE_PORT = 3214


class ReleaseError(RuntimeError):
    pass


def require(condition, message):
    if not condition:
        raise ReleaseError(message)


@dataclass(frozen=True)
class Release:
    name: str

    def __post_init__(self):
        require(re.fullmatch(r"[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}", self.name), "发布标识无效。")

    @property
    def state(self):
        return STATE / self.name

    @property
    def work(self):
        return BUILD_HOME / ("formward-" + self.name)

    @property
    def runtime(self):
        return PRIMARY / "releases" / self.name

    @property
    def current(self):
        return PRIMARY / "current"


def read_json(path):
    return json.loads(path.read_text())


def export_json(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False))
    builder = pwd.getpwnam("ubuntu")
    os.chown(path, builder.pw_uid, builder.pw_gid)


def digest(path):
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def command(*parts, timeout=60):
    return subprocess.run(parts, check=True, capture_output=True, text=True, timeout=timeout).stdout.strip()


def sql(query):
    return command(
        "runuser", "-u", "postgres", "--", "/usr/lib/postgresql/18/bin/psql",
        "-X", "-A", "-t", "-d", "formward_primary", "-c", query,
    )


def require_active(unit):
    require(command("systemctl", "is-active", unit, timeout=15) == "active", f"{unit} 未运行。")


def main_pid(unit):
    pid = int(command("systemctl", "show", unit, "--property=MainPID", "--value", timeout=15))
    require(pid > 1, f"{unit} 缺少运行进程。")
    return pid


def migration_count():
    return int(sql("select count(*) from drizzle.__drizzle_migrations"))


def idle():
    return sql("select count(*) from assistant_runs where state='running'") == "0"


def preflight(release, commit, schema, tables, migrations):
    previous = release.current.resolve()
    metadata = read_json(previous / "release-manifest.json")
    require(metadata["commit"] == commit and metadata["schema"] == schema, "现站源码或数据库结构已变化。")
    result = {
        "release": str(previous), "commit": commit, "buildId": metadata["buildId"],
        "schema": schema, "configHash": digest(ENV_FILE), "capturedAt": datetime.now(timezone.utc).isoformat(),
        "tableCount": int(sql("select count(*) from pg_tables where schemaname='public'")),
        "migrationCount": migration_count(),
    }
    require(result["tableCount"] == tables and result["migrationCount"] == migrations, "正式表或迁移账本数量已变化。")
    for unit in UNITS:
        require_active(unit)
    release.state.mkdir(mode=0o700, exist_ok=True)
    path = release.state / "before.json"
    if path.exists():
        require(read_json(path)["release"] == result["release"], "已有预检使用了不同的现站版本。")
    else:
        path.write_text(json.dumps(result, indent=2))
    release.work.mkdir(mode=0o700, exist_ok=True)
    builder = pwd.getpwnam("ubuntu")
    os.chown(release.work, builder.pw_uid, builder.pw_gid)
    return result


def cache_entry(name):
    return name == ".next/cache" or name.startswith(".next/cache/")


def index_runtime(path):
    entries = []
    for item in sorted(path.rglob("*")):
        name = item.relative_to(path).as_posix()
        require(not cache_entry(name), "待发布目录包含构建缓存。")
        if item.is_symlink():
            target = item.readlink()
            require(not target.is_absolute() and item.resolve().is_relative_to(path), "运行包包含越界链接。")
            entries.append({"path": name, "type": "link", "target": str(target)})
        elif item.is_dir():
            entries.append({"path": name, "type": "directory"})
        else:
            require(item.is_file(), "运行包包含特殊文件。")
            entries.append({"path": name, "type": "file", "bytes": item.stat().st_size, "sha256": digest(item)})
    return entries


def retain_compatible_assets(previous, package):
    old = read_json(previous / ".next/server/server-reference-manifest.json")
    new = read_json(package / ".next/server/server-reference-manifest.json")
    require(old["encryptionKey"] == new["encryptionKey"], "Server Action 绑定密钥不一致。")
    old_actions = set(read_json(previous / ".next/security-actions.json"))
    actions = read_json(package / ".next/security-actions.json")
    require(old_actions <= set(actions), "已有正式动作未全部保留。")
    old_static, new_static = (path / ".next/static" for path in (previous, package))
    retained = 0
    for path in old_static.rglob("*"):
        if not path.is_file():
            continue
        target = new_static / path.relative_to(old_static)
        if target.exists():
            require(digest(target) == digest(path), "同名正式静态资源内容不一致。")
        else:
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(path, target)
            retained += 1
    return retained, len(actions)


def set_runtime_permissions(runtime):
    service = pwd.getpwnam("formward-primary")
    for path in (runtime, *runtime.rglob("*")):
        if path.is_symlink():
            os.lchown(path, 0, service.pw_gid)
        else:
            os.chown(path, 0, service.pw_gid)
            path.chmod(0o750 if path.is_dir() else 0o640)
    cache = runtime / ".next/cache"
    cache.mkdir(exist_ok=True)
    os.chown(cache, service.pw_uid, service.pw_gid)
    cache.chmod(0o700)


def canonical_entry(info):
    if cache_entry(info.name):
        return None
    info.uid = info.gid = 0
    info.uname = info.gname = ""
    info.mtime = 0
    info.pax_headers = {}
    info.mode = 0o750 if info.isdir() else 0o777 if info.issym() else 0o640
    return info


def archive_runtime(runtime, archive):
    with archive.open("xb") as raw, gzip.GzipFile(
        filename="", mode="wb", fileobj=raw, compresslevel=5, mtime=0,
    ) as compressed, tarfile.open(fileobj=compressed, mode="w|", format=tarfile.PAX_FORMAT) as bundle:
        for item in sorted(runtime.iterdir()):
            bundle.add(item, arcname=item.name, filter=canonical_entry)
    builder = pwd.getpwnam("ubuntu")
    os.chown(archive, builder.pw_uid, builder.pw_gid)
    archive.chmod(0o600)


def existing_release(release):
    before = read_json(release.state / "before.json")
    previous = Path(before["release"])
    require(previous.parent == release.runtime.parent, "回退包不在正式版本目录。")
    require(digest(ENV_FILE) == before["configHash"], "正式运行配置已变化。")
    return before, previous


def stage(release):
    before, previous = existing_release(release)
    require(release.current.resolve() == previous, "正式版本已变化。")
    output = release.work / "builder/output" / release.name
    package = output / "standalone"
    manifest = read_json(output / "release-manifest.json")
    request = read_json(release.work / "build-input.json")
    require(
        manifest["release"] == request["release"] == release.name
        and manifest["commit"] == request["commit"]
        and manifest["migrationSha256"] == request["migrationSha256"]
        and manifest["schema"] == before["schema"],
        "构建清单和预期的发布来源不一致。",
    )
    incoming = PRIMARY / "staging" / (release.name + "-transfer")
    require(package.is_dir() and not package.is_symlink(), "缺少待发布构建。")
    require(not release.runtime.exists() and not release.runtime.is_symlink(), "正式候选目录已存在。")
    entries = index_runtime(package)
    shutil.copytree(package, incoming, symlinks=True)
    require(index_runtime(incoming) == entries, "待发布目录未通过逐文件核对。")
    (release.work / "release-manifest.json").write_text(json.dumps(manifest))
    (release.work / (release.name + "-files.json")).write_text(json.dumps({"source": manifest["commit"], "entries": entries}))
    retained, actions = retain_compatible_assets(previous, incoming)
    incoming.rename(release.runtime)
    set_runtime_permissions(release.runtime)
    for directory in (release.runtime, previous):
        command("runuser", "-u", "formward-primary", "--", NODE, GATE, str(directory))
    archive = release.work / (release.name + "-compatible.tar.gz")
    archive_runtime(release.runtime, archive)
    proof = {
        "release": str(release.runtime), "secureRecovery": str(previous),
        "commit": manifest["commit"], "buildId": manifest["buildId"], "schema": manifest["schema"],
        "retainedStatic": retained, "bindingKeyPreserved": True, "securityStartupGatePassed": True,
        "runtimeSha256": digest(archive), "runtimeBytes": archive.stat().st_size, "freshActions": actions,
        "productionUnchanged": True,
    }
    (release.state / "staged.json").write_text(json.dumps(proof, indent=2))
    (release.state / "release-manifest.json").write_text(json.dumps(manifest, indent=2))
    export_json(release.work / "staged.json", proof)
    return proof


def read_environment():
    contents = (PROC / str(main_pid(UNITS[0])) / "environ").read_text()
    environment = dict(entry.split("=", 1) for entry in contents.split("\0") if "=" in entry)
    require(len(environment["FORMWARD_READINESS_SECRET"]) >= 32, "readiness 凭据未配置。")
    return environment


def readiness(port, commit, schema, environment):
    secret = environment["FORMWARD_READINESS_SECRET"]
    require(len(secret) >= 32, "readiness 凭据未配置。")
    public_host = urlsplit(environment.get("FORMWARD_CN_ORIGIN", environment["BETTER_AUTH_URL"])).netloc
    request = Request(
        f"http://127.0.0.1:{port}/api/internal/readiness",
        headers={"Authorization": "Bearer " + secret, "Host": public_host,
                 "X-Forwarded-Proto": "https", "X-Real-IP": "127.0.0.1"},
    )
    for _ in range(80):
        try:
            with urlopen(request, timeout=3) as response:
                data = json.load(response)
            if isinstance(data, dict) and data.get("ready") and data["commit"] == commit and data["schema"] == schema:
                return data
        except (OSError, ValueError, KeyError):
            pass
        time.sleep(0.25)
    raise ReleaseError("readiness 未通过。")


def smoke_candidate(release, commit, schema, environment):
    account = pwd.getpwnam("formward-primary")
    with socket.socket() as probe:
        probe.bind(("127.0.0.1", SMOKE_PORT))
    env = {**environment, "PORT": str(SMOKE_PORT), "HOSTNAME": "127.0.0.1"}
    env.pop("FORMWARD_UPLOAD_PORT", None)
    runtime = release.runtime
    with (release.state / "candidate-smoke.log").open("w") as log:
        process = subprocess.Popen(
            [NODE, str(runtime / "start-standalone.mjs"), str(runtime / "server.js")],
            cwd=runtime, env=env, user=account.pw_uid, group=account.pw_gid,
            extra_groups=[account.pw_gid], stdout=log, stderr=subprocess.STDOUT,
        )
        try:
            readiness(SMOKE_PORT, commit, schema, environment)
        finally:
            process.terminate()
            try:
                process.wait(15)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait()


def table_snapshot():
    names = sql("select tablename from pg_tables where schemaname='public' order by tablename").splitlines()
    result = {}
    for name in names:
        require(name.replace("_", "").isalnum(), "正式库包含未识别的表名。")
        result[name] = sql(
            "select count(*)::text||':'||md5(coalesce(string_agg(h,'' order by h),''))"
            " from (select md5(row_to_json(t)::text) h from public.\"" + name + "\" t) s"
        )
    return result


def backup_database():
    started = datetime.now(timezone.utc)
    command("systemctl", "start", "formward-primary-backup.service", timeout=360)
    backup = max(BACKUPS.glob("formward-primary-*.dump.json"), key=lambda path: path.stat().st_mtime)
    report = read_json(backup)
    require(
        report["nativeListVerified"] and report["offsite"]["remoteReadVerified"]
        and datetime.fromisoformat(report["createdAt"]) >= started - timedelta(seconds=5),
        "缺少本次正式库备份的原生校验和异地回读。",
    )
    return backup.name


def replacement_link(release, kind):
    path = release.current.with_name(f"current.{release.name}-{kind}")
    require(not path.exists() and not path.is_symlink(), "发布替换链接已存在。")
    return path


def replace_current(release, replacement, target):
    replacement.symlink_to(target)
    os.replace(replacement, release.current)


def activate(release):
    before, previous = existing_release(release)
    staged = read_json(release.state / "staged.json")
    accept = read_json(release.work / "acceptance.json")
    commit, schema = staged["commit"], before["schema"]
    require(
        accept["passed"] and accept["source"] == commit and accept["runtimeSha256"] == staged["runtimeSha256"],
        "缺少同一运行包通过验收的证明。",
    )
    require(
        release.current.resolve() == previous and Path(staged["release"]) == release.runtime
        and release.runtime.is_dir() and not release.runtime.is_symlink(),
        "正式入口或待验收目录已变化。",
    )
    require(idle(), "存在生成任务，保留现站，稍后重试。")
    environment = read_environment()
    port = int(environment["PORT"])
    smoke_candidate(release, commit, schema, environment)
    require(release.current.resolve() == previous and idle(), "正式入口已变化或有生成任务。")
    switched = successful = False
    try:
        command("systemctl", "stop", UNITS[0])
        require(idle(), "仍有生成任务，保留 worker 并恢复网页。")
        command("systemctl", "stop", UNITS[1])
        require(idle(), "停写后仍有生成任务。")
        snapshot = table_snapshot()
        require(len(snapshot) == before["tableCount"] and migration_count() == before["migrationCount"], "正式库结构已变化。")
        backup = backup_database()
        require(table_snapshot() == snapshot and release.current.resolve() == previous, "备份期间正式数据或入口已变化。")
        replace_current(release, replacement_link(release, "next"), release.runtime)
        switched = True
        require(table_snapshot() == snapshot, "停写切换前后正式数据库摘要不一致。")
        command("systemctl", "start", *UNITS)
        ready = readiness(port, commit, schema, environment)
        for unit in UNITS:
            require_active(unit)
        require(digest(ENV_FILE) == before["configHash"], "正式运行配置已变化。")
        successful = True
        result = {
            "published": True, "version": "dual-entry-" + commit[:8] + "-" + release.name,
            "commit": commit, "buildId": staged["buildId"], "schema": ready["schema"],
            "publishedAt": datetime.now(timezone.utc).isoformat(), "runtimeSha256": staged["runtimeSha256"],
            "backup": backup, "nativeAndOffsiteBackupVerified": True, "databaseTablesUnchanged": len(snapshot),
            "configurationUnchanged": True, "servicesActive": True, "compatibleRecovery": str(previous),
        }
        (release.state / "published.json").write_text(json.dumps(result, indent=2))
        export_json(release.work / "published.json", result)
        return result
    finally:
        if not successful:
            if switched:
                command("systemctl", "stop", *UNITS)
                replace_current(release, replacement_link(release, "rollback"), previous)
            command("systemctl", "start", *UNITS)
            readiness(port, before["commit"], schema, environment)


def rollback(release):
    before, previous = existing_release(release)
    staged = read_json(release.state / "staged.json")
    require(release.current.resolve() == Path(staged["release"]) == release.runtime, "当前指向的版本不是待回退候选。")
    require(read_json(previous / "release-manifest.json")["commit"] == before["commit"], "兼容回退包源码不符。")
    environment = read_environment()
    port = int(environment["PORT"])
    replacement = replacement_link(release, "public-rollback")
    command("systemctl", "stop", *UNITS)
    replace_current(release, replacement, previous)
    command("systemctl", "start", *UNITS)
    for unit in UNITS:
        require_active(unit)
    ready = readiness(port, before["commit"], before["schema"], environment)
    require(release.current.resolve() == previous, "正式入口未恢复。")
    result = {"rolledBack": True, "commit": ready["commit"], "schema": ready["schema"], "servicesActive": True}
    (release.state / "public-rollback.json").write_text(json.dumps(result, indent=2))
    return result


def verify(release, commit):
    require(release.current.resolve() == release.runtime, "正式入口未指向目标版本。")
    require((release.runtime / "SOURCE_COMMIT").read_text().strip() == commit, "正式入口源码与预期不一致。")
    results = []
    for unit in UNITS:
        require_active(unit)
        cwd = (PROC / str(main_pid(unit)) / "cwd").resolve()
        require(cwd == release.runtime, f"{unit} 尚未运行目标构建。")
        results.append({"unit": unit, "active": True, "source": commit, "runtime": str(cwd)})
    return {"passed": True, "verifiedAt": datetime.now(timezone.utc).isoformat(), "commit": commit, "services": results}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    steps = parser.add_subparsers(dest="step", required=True)
    for step in ("preflight", "stage", "activate", "verify", "rollback"):
        sub = steps.add_parser(step)
        sub.add_argument("release")
        if step in ("preflight", "verify"):
            sub.add_argument("commit")
        if step == "preflight":
            sub.add_argument("schema")
            sub.add_argument("tables", type=int)
            sub.add_argument("migrations", type=int)
    args = parser.parse_args()
    release = Release(args.release)
    if args.step in ("preflight", "verify") and not re.fullmatch(r"[a-f0-9]{40}", args.commit):
        parser.error("需要完整的 Git 源码提交。")
    os.umask(0o077)
    if args.step == "preflight":
        result = preflight(release, args.commit, args.schema, args.tables, args.migrations)
    elif args.step == "verify":
        result = verify(release, args.commit)
    else:
        result = {"stage": stage, "activate": activate, "rollback": rollback}[args.step](release)
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
