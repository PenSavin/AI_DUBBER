import sqlite3
import sys
import tempfile
import time
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from job_manager import PersistentJobManager


class PersistentJobManagerTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.database_path = Path(self.temp_dir.name) / "jobs.sqlite3"
        self.manager = PersistentJobManager(self.database_path, max_workers=1, max_pending=5)

    def tearDown(self):
        self.manager.shutdown()
        self.temp_dir.cleanup()

    def wait_for_status(self, job_id, expected, timeout=3):
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            job = self.manager.get_job(job_id)
            if job["status"] == expected:
                return job
            time.sleep(0.01)
        self.fail(f"Job {job_id} did not reach {expected}: {self.manager.get_job(job_id)}")

    def test_persists_result_and_retries_failed_job(self):
        calls = []

        def processor(payload, context):
            calls.append(payload["value"])
            if len(calls) == 1:
                raise RuntimeError("temporary failure")
            context.update(50, "processing", "Halfway")
            return {"value": payload["value"]}

        self.manager.start({"demo": processor})
        job = self.manager.create_job("demo", {"value": 7})
        failed = self.wait_for_status(job["id"], "failed")
        self.assertEqual(failed["error"], "temporary failure")

        self.manager.retry_job(job["id"])
        completed = self.wait_for_status(job["id"], "completed")
        self.assertEqual(completed["attempt"], 2)
        self.assertEqual(completed["progress"], 100)
        self.assertEqual(completed["result"], {"value": 7})

        self.manager.shutdown()
        reopened = PersistentJobManager(self.database_path)
        reopened.start({"demo": processor})
        self.assertEqual(reopened.get_job(job["id"])["result"], {"value": 7})
        reopened.shutdown()

    def test_cancelled_work_and_restart_recovery(self):
        def processor(_payload, context):
            while True:
                context.check_cancelled()
                time.sleep(0.01)

        self.manager.start({"demo": processor})
        job = self.manager.create_job("demo", {})
        self.wait_for_status(job["id"], "running")
        self.manager.cancel_job(job["id"])
        self.wait_for_status(job["id"], "cancelled")
        self.manager.shutdown()

        connection = sqlite3.connect(self.database_path)
        with connection:
            connection.execute(
                "UPDATE jobs SET status='running', stage='processing' WHERE id=?",
                (job["id"],),
            )
        connection.close()

        recovered = PersistentJobManager(self.database_path)
        recovered.start({"demo": processor})
        self.assertEqual(recovered.get_job(job["id"])["status"], "interrupted")
        recovered.shutdown()


if __name__ == "__main__":
    unittest.main()
