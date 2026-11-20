import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tarfile
from tempfile import TemporaryDirectory
from types import SimpleNamespace
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("primary_release", Path(__file__).with_name("primary-release.py"))
release = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = release
spec.loader.exec_module(release)

PREVIOUS = "1" * 40
CANDIDATE = "2" * 40
SCHEMA = "0046_assistant_conversation_removal"


class ReleaseTests(unittest.TestCase):
    def setUp(self):
        fixture = self.enterContext(TemporaryDirectory(prefix="formward-primary-test-"))
        folder = Path(fixture)
        self.enterContext(patch.multiple(
            release, PRIMARY=folder / "hosting", STATE=folder / "state",
            BUILD_HOME=folder / "builder", ENV_FILE=folder / "primary.env",
            PROC=folder / "proc", BACKUPS=folder / "backups",
        ))
        self.candidate = release.Release("candidate")
        self.previous = release.Release("previous")
        self.events = []
        self.previous.runtime.mkdir(parents=True)
        self.candidate.current.symlink_to(self.previous.runtime)
        for path in (release.STATE, release.BUILD_HOME, release.PRIMARY / "staging", release.BACKUPS):
            path.mkdir()
        release.ENV_FILE.write_text("fixture")
        self.put(self.previous.runtime / "release-manifest.json", {
            "commit": PREVIOUS, "buildId": "old-build", "schema": SCHEMA,
        })
        account = SimpleNamespace(pw_uid=os.getuid(), pw_gid=os.getgid())
        self.enterContext(patch.object(release.pwd, "getpwnam", return_value=account))
        self.enterContext(patch.object(release.os, "chown"))
        self.enterContext(patch.object(release.os, "lchown"))
        self.command = self.enterContext(patch.object(release, "command", side_effect=self.run_command))
        self.enterContext(patch.object(release, "sql", side_effect=self.sql))
        for pid in (321, 322):
            process = release.PROC / str(pid)
            process.mkdir(parents=True)
            (process / "environ").write_text(
                "PORT=3200\0FORMWARD_READINESS_SECRET=" + "r" * 32 + "\0BETTER_AUTH_URL=https://example.test\0"
            )
            (process / "cwd").symlink_to(self.previous.runtime)

    @staticmethod
    def put(path, value):
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(value))

    def run_command(self, *args, **kwargs):
        self.events.append(args)
        if args[:2] == ("systemctl", "is-active"):
            return "active"
        if args[:2] == ("systemctl", "show"):
            return str(321 + release.UNITS.index(args[2]))
        if args == ("systemctl", "start", "formward-primary-backup.service"):
            self.put(release.BACKUPS / "formward-primary-fixture.dump.json", {
                "nativeListVerified": True, "offsite": {"remoteReadVerified": True},
                "createdAt": release.datetime.now(release.timezone.utc).isoformat(),
            })
        return ""

    @staticmethod
    def sql(query):
        if "tablename" in query:
            return "assistant_runs\nusers"
        if "pg_tables" in query:
            return "2"
        if "drizzle" in query:
            return "46"
        if "state='running'" in query:
            return "0"
        if "row_to_json" in query:
            return "1:unchanged"
        raise AssertionError(query)

    def prepare(self):
        release.preflight(self.candidate, PREVIOUS, SCHEMA, 2, 46)
        output = self.candidate.work / "builder/output" / self.candidate.name
        manifest = {
            "release": self.candidate.name, "commit": CANDIDATE,
            "buildId": "test-build", "schema": SCHEMA, "migrationSha256": "a" * 64,
        }
        self.put(self.candidate.work / "build-input.json", manifest)
        self.put(output / "release-manifest.json", manifest)
        package = output / "standalone"
        for runtime, commit in ((self.previous.runtime, PREVIOUS), (package, CANDIDATE)):
            self.put(runtime / ".next/server/server-reference-manifest.json", {"encryptionKey": "synthetic-binding"})
            self.put(runtime / ".next/security-actions.json", ["write-record"])
            (runtime / "SOURCE_COMMIT").write_text(commit)
            assets = runtime / ".next/static"
            assets.mkdir(parents=True)
            (assets / ("base.css" if commit == PREVIOUS else "next.css")).write_text(commit)
        (package / "internal-link").symlink_to("SOURCE_COMMIT")
        return package

    def accept(self):
        self.prepare()
        report = release.stage(self.candidate)
        self.put(self.candidate.work / "acceptance.json", {
            "passed": True, "source": CANDIDATE, "runtimeSha256": report["runtimeSha256"],
        })
        self.events.clear()
        return report

    def exercise_activation(self, error=None):
        if error is None:
            def readiness(port, commit, schema, environment):
                self.assertEqual(port, 3200)
                self.assertEqual(self.candidate.current.resolve(), self.candidate.runtime if commit == CANDIDATE else self.previous.runtime)
                return {"ready": True, "commit": commit, "schema": schema}
        else:
            readiness = error
        self.enterContext(patch.object(release, "readiness", side_effect=readiness))
        return self.enterContext(patch.object(release, "smoke_candidate"))

    def test_preflight_checks_source_schema_and_table_count(self):
        for values in ((CANDIDATE, SCHEMA, 2, 46), (PREVIOUS, "old-schema", 2, 46), (PREVIOUS, SCHEMA, 3, 46), (PREVIOUS, SCHEMA, 2, 45)):
            with self.subTest(values=values), self.assertRaises(release.ReleaseError):
                release.preflight(self.candidate, *values)
        self.assertFalse(self.candidate.state.exists())
        with self.assertRaises(release.ReleaseError):
            release.Release("../candidate")

    def test_stage_keeps_assets_and_produces_reproducible_archive(self):
        self.prepare()
        result = release.stage(self.candidate)
        runtime = self.candidate.runtime
        self.assertEqual(result["retainedStatic"], 1)
        self.assertEqual(self.candidate.current.resolve(), self.previous.runtime)
        self.assertEqual((runtime / ".next/static/base.css").read_text(), PREVIOUS)
        archive = self.candidate.work / "candidate-compatible.tar.gz"
        self.assertEqual(release.digest(archive), result["runtimeSha256"])
        repeat = self.candidate.work / "repeated.tar.gz"
        release.archive_runtime(runtime, repeat)
        self.assertEqual(release.digest(repeat), result["runtimeSha256"])
        with tarfile.open(archive) as bundle:
            self.assertEqual(bundle.getmember("internal-link").linkname, "SOURCE_COMMIT")
            self.assertNotIn(".next/cache", bundle.getnames())
        self.assertEqual([args[-1] for args in self.events if args[0] == "runuser"],
                         [str(runtime), str(self.previous.runtime)])

    def test_retired_action_refuses_to_stage(self):
        package = self.prepare()
        self.put(package / ".next/security-actions.json", [])
        with self.assertRaisesRegex(release.ReleaseError, "正式动作"):
            release.stage(self.candidate)
        self.assertFalse(self.candidate.runtime.exists())
        self.assertFalse((self.candidate.state / "staged.json").exists())

    def test_unexpected_symlink_refuses_to_stage(self):
        package = self.prepare()
        (package / "outside").symlink_to(self.previous.runtime)
        with self.assertRaisesRegex(release.ReleaseError, "越界"):
            release.stage(self.candidate)
        self.assertFalse(self.candidate.runtime.exists())

    def test_mismatched_runtime_refuses_to_stop_site(self):
        self.accept()
        self.put(self.candidate.work / "acceptance.json", {"passed": True, "source": CANDIDATE, "runtimeSha256": "other"})
        with self.assertRaisesRegex(release.ReleaseError, "同一运行包"):
            release.activate(self.candidate)
        self.assertEqual(self.events, [])

    def test_busy_job_refuses_to_stop_site(self):
        self.accept()
        with patch.object(release, "idle", return_value=False), self.assertRaisesRegex(release.ReleaseError, "生成任务"):
            release.activate(self.candidate)
        self.assertEqual(self.events, [])

    def test_smoke_failure_refuses_to_stop_site(self):
        self.accept()
        with patch.object(release, "smoke_candidate", side_effect=release.ReleaseError("smoke")):
            with self.assertRaisesRegex(release.ReleaseError, "smoke"):
                release.activate(self.candidate)
        self.assertEqual(self.events, [("systemctl", "show", release.UNITS[0], "--property=MainPID", "--value")])
        self.assertEqual(self.candidate.current.resolve(), self.previous.runtime)

    def test_backup_failure_restarts_previous_runtime(self):
        self.accept()
        self.exercise_activation()
        with patch.object(release, "backup_database", side_effect=subprocess.CalledProcessError(1, "backup")):
            with self.assertRaises(subprocess.CalledProcessError):
                release.activate(self.candidate)
        self.assertEqual(self.candidate.current.resolve(), self.previous.runtime)
        self.assertIn(("systemctl", "start", *release.UNITS), self.events)
        self.assertFalse((self.candidate.state / "published.json").exists())

    def test_failed_activation_restarts_previous_runtime(self):
        self.accept()

        def readiness(port, commit, schema, environment):
            if commit == CANDIDATE:
                self.assertEqual(self.candidate.current.resolve(), self.candidate.runtime)
                raise release.ReleaseError("candidate")
            self.assertEqual(self.candidate.current.resolve(), self.previous.runtime)
            return {"commit": commit, "schema": schema}

        self.exercise_activation(readiness)
        with self.assertRaisesRegex(release.ReleaseError, "candidate"):
            release.activate(self.candidate)
        self.assertEqual(self.candidate.current.resolve(), self.previous.runtime)
        self.assertEqual(self.events.count(("systemctl", "start", *release.UNITS)), 2)

    def test_success_and_compatible_rollback(self):
        staged = self.accept()
        smoke = self.exercise_activation()
        result = release.activate(self.candidate)
        self.assertTrue(result["published"])
        self.assertEqual(result["runtimeSha256"], staged["runtimeSha256"])
        self.assertEqual(result["databaseTablesUnchanged"], 2)
        self.assertTrue(result["nativeAndOffsiteBackupVerified"])
        self.assertEqual(self.candidate.current.resolve(), self.candidate.runtime)
        smoke.assert_called_once()
        for pid in (321, 322):
            cwd = release.PROC / str(pid) / "cwd"
            cwd.unlink()
            cwd.symlink_to(self.candidate.runtime)
        self.assertTrue(release.verify(self.candidate, CANDIDATE)["passed"])
        with self.assertRaisesRegex(release.ReleaseError, "源码"):
            release.verify(self.candidate, PREVIOUS)
        result = release.rollback(self.candidate)
        self.assertTrue(result["rolledBack"])
        self.assertEqual(self.candidate.current.resolve(), self.previous.runtime)

    def test_stale_rollback_link_does_not_stop_site(self):
        self.accept()
        self.exercise_activation()
        release.activate(self.candidate)
        release.replacement_link(self.candidate, "public-rollback").symlink_to(self.previous.runtime)
        self.events.clear()
        with self.assertRaisesRegex(release.ReleaseError, "替换链接"):
            release.rollback(self.candidate)
        self.assertFalse(any(event[:2] == ("systemctl", "stop") for event in self.events))
        self.assertEqual(self.candidate.current.resolve(), self.candidate.runtime)


if __name__ == "__main__":
    unittest.main()
