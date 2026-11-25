"""Persistent local job tracking for long-running media operations."""

from __future__ import annotations

from concurrent.futures import Future, ThreadPoolExecutor
from contextlib import contextmanager
from datetime import datetime, timezone
import json
from pathlib import Path
import sqlite3
import threading
import uuid
from typing import Any, Callable


class JobCancelled(Exception):
    """Raised by a job processor when its cancellation event is set."""


class JobNotFound(Exception):
    pass


class JobConflict(Exception):
    pass


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


class JobContext:
    def __init__(self, manager: "PersistentJobManager", job_id: str, cancel_event: threading.Event):
        self.manager = manager
        self.job_id = job_id
        self.cancel_event = cancel_event

    @property
    def cancellation_requested(self) -> bool:
        return self.cancel_event.is_set()

    def check_cancelled(self) -> None:
        if self.cancellation_requested:
            raise JobCancelled("Job cancellation requested.")

    def update(self, progress: float, stage: str, message: str) -> None:
        self.check_cancelled()
        self.manager.update_progress(self.job_id, progress, stage, message)


JobProcessor = Callable[[dict[str, Any], JobContext], dict[str, Any]]


class PersistentJobManager:
    """A bounded, single-process worker queue backed by SQLite job records."""

    def __init__(self, database_path: Path, max_workers: int = 1, max_pending: int = 20):
        self.database_path = Path(database_path)
        self.database_path.parent.mkdir(parents=True, exist_ok=True)
        self.max_workers = max(1, int(max_workers))
        self.max_pending = max(1, int(max_pending))
        self._lock = threading.RLock()
        self._executor: ThreadPoolExecutor | None = None
        self._processors: dict[str, JobProcessor] = {}
        self._futures: dict[str, Future] = {}
        self._cancel_events: dict[str, threading.Event] = {}
        self._stopping = False
        self._initialize_database()

    @contextmanager
    def _connect(self):
        connection = sqlite3.connect(self.database_path, timeout=30)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA busy_timeout = 30000")
        try:
            yield connection
            connection.commit()
        except Exception:
            connection.rollback()
            raise
        finally:
            connection.close()

    def _initialize_database(self) -> None:
        with self._connect() as connection:
            connection.execute("PRAGMA journal_mode = WAL")
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS jobs (
                    id TEXT PRIMARY KEY,
                    kind TEXT NOT NULL,
                    status TEXT NOT NULL,
                    progress REAL NOT NULL DEFAULT 0,
                    stage TEXT NOT NULL,
                    message TEXT NOT NULL,
                    payload_json TEXT NOT NULL,
                    result_json TEXT,
                    error TEXT,
                    attempt INTEGER NOT NULL DEFAULT 1,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    started_at TEXT,
                    completed_at TEXT
                )
                """
            )
            connection.execute("CREATE INDEX IF NOT EXISTS jobs_created_idx ON jobs(created_at DESC)")
            connection.execute("CREATE INDEX IF NOT EXISTS jobs_kind_status_idx ON jobs(kind, status)")

    def start(self, processors: dict[str, JobProcessor]) -> None:
        with self._lock:
            if self._executor is not None:
                return
            self._processors = dict(processors)
            self._stopping = False
            with self._connect() as connection:
                connection.execute(
                    "UPDATE jobs SET status='interrupted', stage='interrupted', "
                    "message='The app restarted while this job was running. Retry to continue.', "
                    "updated_at=?, completed_at=? WHERE status='running'",
                    (_now(), _now()),
                )
                queued_ids = [row[0] for row in connection.execute("SELECT id FROM jobs WHERE status='queued' ORDER BY created_at")]
            self._executor = ThreadPoolExecutor(max_workers=self.max_workers, thread_name_prefix="ai-dubber-job")
            for job_id in queued_ids:
                self._schedule_locked(job_id)

    def shutdown(self) -> None:
        with self._lock:
            executor = self._executor
            if executor is None:
                return
            self._stopping = True
            for event in self._cancel_events.values():
                event.set()
        executor.shutdown(wait=True, cancel_futures=True)
        with self._lock:
            self._executor = None
            self._futures.clear()
            self._cancel_events.clear()

    def create_job(self, kind: str, payload: dict[str, Any], message: str = "Waiting in the local job queue.") -> dict[str, Any]:
        with self._lock:
            if self._executor is None or self._stopping:
                raise RuntimeError("The local job service is not running.")
            if kind not in self._processors:
                raise ValueError(f"Unsupported job type: {kind}")
            with self._connect() as connection:
                pending = connection.execute("SELECT COUNT(*) FROM jobs WHERE status IN ('queued', 'running')").fetchone()[0]
                if pending >= self.max_pending:
                    raise JobConflict("The local job queue is full. Wait for a job to finish before adding another.")
                job_id = uuid.uuid4().hex
                now = _now()
                connection.execute(
                    "INSERT INTO jobs (id, kind, status, progress, stage, message, payload_json, attempt, created_at, updated_at) "
                    "VALUES (?, ?, 'queued', 0, 'queued', ?, ?, 1, ?, ?)",
                    (job_id, kind, message, json.dumps(payload, ensure_ascii=False), now, now),
                )
            self._schedule_locked(job_id)
            return self.get_job(job_id)

    def _schedule_locked(self, job_id: str) -> None:
        if self._executor is None:
            return
        event = threading.Event()
        self._cancel_events[job_id] = event
        future = self._executor.submit(self._run_job, job_id, event)
        self._futures[job_id] = future

    def _run_job(self, job_id: str, cancel_event: threading.Event) -> None:
        try:
            with self._lock:
                with self._connect() as connection:
                    row = connection.execute("SELECT * FROM jobs WHERE id=?", (job_id,)).fetchone()
                    if not row or row["status"] != "queued":
                        return
                    if cancel_event.is_set():
                        if not self._stopping:
                            now = _now()
                            connection.execute(
                                "UPDATE jobs SET status='cancelled', stage='cancelled', message='Job cancelled.', updated_at=?, completed_at=? WHERE id=?",
                                (now, now, job_id),
                            )
                        return
                    now = _now()
                    connection.execute(
                        "UPDATE jobs SET status='running', stage='starting', message='Starting job.', started_at=?, updated_at=? WHERE id=? AND status='queued'",
                        (now, now, job_id),
                    )
                    kind = row["kind"]
                    payload = json.loads(row["payload_json"])
                    processor = self._processors.get(kind)

            if processor is None:
                raise RuntimeError(f"No processor is registered for job type '{kind}'.")
            context = JobContext(self, job_id, cancel_event)
            result = processor(payload, context)
            context.check_cancelled()
            with self._connect() as connection:
                now = _now()
                connection.execute(
                    "UPDATE jobs SET status='completed', progress=100, stage='completed', message='Job completed.', "
                    "result_json=?, error=NULL, updated_at=?, completed_at=? WHERE id=? AND status='running'",
                    (json.dumps(result, ensure_ascii=False), now, now, job_id),
                )
        except JobCancelled:
            with self._lock, self._connect() as connection:
                now = _now()
                status = "interrupted" if self._stopping else "cancelled"
                message = "Interrupted while the app was closing. Retry to continue." if self._stopping else "Job cancelled."
                connection.execute(
                    "UPDATE jobs SET status=?, stage=?, message=?, updated_at=?, completed_at=? WHERE id=? AND status='running'",
                    (status, status, message, now, now, job_id),
                )
        except Exception as error:
            with self._connect() as connection:
                now = _now()
                message = str(error).strip() or error.__class__.__name__
                connection.execute(
                    "UPDATE jobs SET status='failed', stage='failed', message='Job failed.', error=?, updated_at=?, completed_at=? WHERE id=? AND status='running'",
                    (message[:4000], now, now, job_id),
                )
        finally:
            with self._lock:
                self._futures.pop(job_id, None)
                self._cancel_events.pop(job_id, None)

    def update_progress(self, job_id: str, progress: float, stage: str, message: str) -> None:
        bounded = min(99.9, max(0.0, float(progress)))
        with self._connect() as connection:
            connection.execute(
                "UPDATE jobs SET progress=MAX(progress, ?), stage=?, message=?, updated_at=? WHERE id=? AND status='running'",
                (bounded, str(stage)[:80], str(message)[:500], _now(), job_id),
            )

    def _decode_row(self, row: sqlite3.Row) -> dict[str, Any]:
        result = dict(row)
        result.pop("payload_json", None)
        payload = row["payload_json"]
        result["payload"] = json.loads(payload) if payload else None
        result["result"] = json.loads(row["result_json"]) if row["result_json"] else None
        result.pop("result_json", None)
        return result

    def get_job(self, job_id: str) -> dict[str, Any]:
        with self._connect() as connection:
            row = connection.execute("SELECT * FROM jobs WHERE id=?", (job_id,)).fetchone()
        if not row:
            raise JobNotFound(job_id)
        return self._decode_row(row)

    def list_jobs(self, kind: str | None = None, limit: int = 50) -> list[dict[str, Any]]:
        safe_limit = min(100, max(1, int(limit)))
        with self._connect() as connection:
            if kind:
                rows = connection.execute("SELECT * FROM jobs WHERE kind=? ORDER BY created_at DESC LIMIT ?", (kind, safe_limit)).fetchall()
            else:
                rows = connection.execute("SELECT * FROM jobs ORDER BY created_at DESC LIMIT ?", (safe_limit,)).fetchall()
        return [self._decode_row(row) for row in rows]

    def cancel_job(self, job_id: str) -> dict[str, Any]:
        with self._lock:
            job = self.get_job(job_id)
            if job["status"] not in {"queued", "running"}:
                raise JobConflict(f"A {job['status']} job cannot be cancelled.")
            event = self._cancel_events.get(job_id)
            future = self._futures.get(job_id)
            if event is not None:
                event.set()
            if job["status"] == "queued" and future is not None and future.cancel():
                now = _now()
                with self._connect() as connection:
                    connection.execute(
                        "UPDATE jobs SET status='cancelled', stage='cancelled', message='Job cancelled.', updated_at=?, completed_at=? WHERE id=? AND status='queued'",
                        (now, now, job_id),
                    )
                self._futures.pop(job_id, None)
                self._cancel_events.pop(job_id, None)
            elif job["status"] == "running":
                with self._connect() as connection:
                    connection.execute(
                        "UPDATE jobs SET stage='cancelling', message='Cancellation requested; stopping the active media process.', updated_at=? WHERE id=? AND status='running'",
                        (_now(), job_id),
                    )
        return self.get_job(job_id)

    def retry_job(self, job_id: str) -> dict[str, Any]:
        with self._lock:
            if self._executor is None or self._stopping:
                raise RuntimeError("The local job service is not running.")
            job = self.get_job(job_id)
            if job["status"] not in {"failed", "cancelled", "interrupted"}:
                raise JobConflict(f"A {job['status']} job cannot be retried.")
            if job_id in self._futures:
                raise JobConflict("The job is still finishing. Retry again in a moment.")
            if job["kind"] not in self._processors:
                raise JobConflict(f"No processor is registered for job type '{job['kind']}'.")
            with self._connect() as connection:
                pending = connection.execute("SELECT COUNT(*) FROM jobs WHERE status IN ('queued', 'running')").fetchone()[0]
                if pending >= self.max_pending:
                    raise JobConflict("The local job queue is full. Wait for a job to finish before retrying.")
                connection.execute(
                    "UPDATE jobs SET status='queued', progress=0, stage='queued', message='Retry queued.', "
                    "result_json=NULL, error=NULL, attempt=attempt+1, started_at=NULL, completed_at=NULL, updated_at=? WHERE id=?",
                    (_now(), job_id),
                )
            self._schedule_locked(job_id)
        return self.get_job(job_id)
