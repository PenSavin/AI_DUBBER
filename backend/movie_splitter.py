"""FFmpeg-backed fixed-duration movie splitting helpers."""

from __future__ import annotations

from collections import deque
import math
import os
from pathlib import Path
import re
import subprocess
import threading
import zipfile

from job_manager import JobCancelled, JobContext


def build_split_plan(duration_seconds: float, segment_seconds: float) -> list[dict[str, float | int]]:
    duration = float(duration_seconds)
    segment = float(segment_seconds)
    if not math.isfinite(duration) or duration <= 0:
        raise ValueError("The source video duration must be greater than zero.")
    if not math.isfinite(segment) or segment < 15 or segment > 3600:
        raise ValueError("Part duration must be between 15 seconds and 60 minutes.")
    part_count = math.ceil(duration / segment)
    return [
        {
            "index": index + 1,
            "start_seconds": round(index * segment, 3),
            "duration_seconds": round(min(segment, duration - index * segment), 3),
        }
        for index in range(part_count)
    ]


def _safe_stem(filename: str) -> str:
    stem = Path(filename).stem
    stem = re.sub(r"[^A-Za-z0-9._-]+", "_", stem).strip("._-")
    return (stem or "movie")[:80]


def _ffmpeg_time_seconds(values: dict[str, str]) -> float | None:
    raw = values.get("out_time_us") or values.get("out_time_ms")
    if raw and raw not in {"N/A", "-1"}:
        try:
            return max(0.0, int(raw) / 1_000_000)
        except ValueError:
            pass
    raw_time = values.get("out_time")
    if raw_time and raw_time != "N/A":
        try:
            hours, minutes, seconds = raw_time.split(":", 2)
            return max(0.0, int(hours) * 3600 + int(minutes) * 60 + float(seconds))
        except (ValueError, TypeError):
            pass
    return None


def _terminate_process(process: subprocess.Popen) -> None:
    if process.poll() is not None:
        return
    try:
        process.terminate()
        process.wait(timeout=5)
    except Exception:
        try:
            process.kill()
        except Exception:
            pass
        try:
            process.wait(timeout=5)
        except Exception:
            pass


def _run_ffmpeg(
    command: list[str],
    context: JobContext,
    on_progress,
) -> None:
    context.check_cancelled()
    process = subprocess.Popen(
        command,
        stdin=subprocess.DEVNULL,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        encoding="utf-8",
        errors="replace",
        bufsize=1,
    )
    stderr_tail: deque[str] = deque(maxlen=40)

    def collect_stderr() -> None:
        if process.stderr is None:
            return
        for line in process.stderr:
            stderr_tail.append(line.rstrip())

    stderr_thread = threading.Thread(target=collect_stderr, daemon=True, name="ffmpeg-stderr")
    stderr_thread.start()
    progress_values: dict[str, str] = {}
    try:
        if process.stdout is None:
            raise RuntimeError("FFmpeg progress output was not available.")
        for line in process.stdout:
            context.check_cancelled()
            key, separator, value = line.strip().partition("=")
            if not separator:
                continue
            progress_values[key] = value
            if key == "progress":
                current_seconds = _ffmpeg_time_seconds(progress_values)
                if current_seconds is not None:
                    on_progress(current_seconds)
                progress_values.clear()
        return_code = process.wait()
        stderr_thread.join(timeout=2)
        context.check_cancelled()
        if return_code != 0:
            detail = "\n".join(stderr_tail).strip()
            raise RuntimeError(f"FFmpeg exited with code {return_code}. {detail[-2500:]}")
    except JobCancelled:
        _terminate_process(process)
        raise
    finally:
        if process.poll() is None:
            _terminate_process(process)
        if process.stdout is not None:
            process.stdout.close()
        if process.stderr is not None:
            process.stderr.close()


def _thumbnail(
    ffmpeg_binary: str,
    video_path: Path,
    output_path: Path,
    seek_seconds: float,
    context: JobContext,
) -> None:
    command = [
        ffmpeg_binary, "-hide_banner", "-nostdin", "-y",
        "-ss", f"{max(0.0, seek_seconds):.3f}", "-i", str(video_path),
        "-frames:v", "1", "-vf", "scale=480:-2", "-q:v", "3", str(output_path),
    ]
    process = subprocess.Popen(
        command,
        stdin=subprocess.DEVNULL,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.PIPE,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    try:
        while True:
            context.check_cancelled()
            try:
                _, stderr = process.communicate(timeout=0.2)
                break
            except subprocess.TimeoutExpired:
                continue
    except JobCancelled:
        _terminate_process(process)
        process.communicate()
        raise
    if process.returncode != 0 or not output_path.is_file():
        detail = (stderr or "").strip()
        raise RuntimeError(f"Could not create a preview thumbnail. {detail[-1500:]}")


def _write_archive(parts: list[dict], archive_path: Path, context: JobContext) -> None:
    temporary_path = archive_path.with_suffix(archive_path.suffix + ".part")
    total_bytes = sum(Path(part["path"]).stat().st_size for part in parts)
    copied_bytes = 0
    try:
        with zipfile.ZipFile(temporary_path, "w", compression=zipfile.ZIP_STORED, allowZip64=True) as archive:
            for part in parts:
                source = Path(part["path"])
                with source.open("rb") as input_file, archive.open(source.name, "w", force_zip64=True) as zip_member:
                    while True:
                        context.check_cancelled()
                        chunk = input_file.read(1024 * 1024)
                        if not chunk:
                            break
                        zip_member.write(chunk)
                        copied_bytes += len(chunk)
                        if total_bytes:
                            percent = 94 + (copied_bytes / total_bytes) * 5
                            context.update(percent, "packaging", f"Preparing ZIP: {copied_bytes / total_bytes:.0%} of media added.")
        os.replace(temporary_path, archive_path)
    finally:
        temporary_path.unlink(missing_ok=True)


def run_movie_split_job(
    source_path: Path,
    payload: dict,
    context: JobContext,
    ffmpeg_binary: str,
    outputs_dir: Path,
) -> dict:
    source_path = Path(source_path)
    outputs_dir = Path(outputs_dir)
    source_duration = float(payload["source_duration_seconds"])
    segment_seconds = float(payload["segment_seconds"])
    mode = str(payload["mode"])
    plan = build_split_plan(source_duration, segment_seconds)
    if len(plan) > 2000:
        raise ValueError("This split would create more than 2,000 parts. Increase the part duration.")

    prefix = f"split_{context.job_id}_{_safe_stem(source_path.name)}"
    archive_path = outputs_dir / f"{prefix}.zip"
    pattern = outputs_dir / f"{prefix}_part_%04d.mp4"
    generated_paths: list[Path] = []
    video_paths: list[Path] = []
    temporary_paths = [archive_path.with_suffix(archive_path.suffix + ".part")]
    for old_path in outputs_dir.glob(f"{prefix}_part_*"):
        old_path.unlink(missing_ok=True)
    archive_path.unlink(missing_ok=True)

    context.update(1, "preparing", f"Preparing {len(plan)} parts from {source_path.name}.")
    try:
        if mode == "copy":
            command = [
                ffmpeg_binary, "-hide_banner", "-nostdin", "-y", "-i", str(source_path),
                "-map", "0:v:0", "-map", "0:a?", "-c", "copy",
                "-f", "segment", "-segment_time", f"{segment_seconds:.3f}",
                "-segment_start_number", "1", "-reset_timestamps", "1",
                "-segment_format", "mp4", "-segment_format_options", "movflags=+faststart",
                "-progress", "pipe:1", "-stats_period", "0.5", "-nostats", str(pattern),
            ]
            _run_ffmpeg(
                command,
                context,
                lambda elapsed: context.update(
                    2 + min(82, elapsed / source_duration * 82),
                    "splitting",
                    f"Stream-copying video: {min(source_duration, elapsed) / source_duration:.0%} of source duration.",
                ),
            )
            generated_paths = sorted(outputs_dir.glob(f"{prefix}_part_*.mp4"))
        else:
            completed_seconds = 0.0
            for part in plan:
                context.check_cancelled()
                index = int(part["index"])
                part_duration = float(part["duration_seconds"])
                output_path = outputs_dir / f"{prefix}_part_{index:04d}.mp4"
                generated_paths.append(output_path)
                command = [
                    ffmpeg_binary, "-hide_banner", "-nostdin", "-y",
                    "-ss", f"{float(part['start_seconds']):.3f}", "-i", str(source_path),
                    "-t", f"{part_duration:.3f}", "-map", "0:v:0", "-map", "0:a?",
                    "-c:v", "libx264", "-preset", "veryfast", "-crf", "21", "-pix_fmt", "yuv420p",
                    "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart",
                    "-progress", "pipe:1", "-stats_period", "0.5", "-nostats", str(output_path),
                ]

                def update_part_progress(elapsed: float, part=part, done=completed_seconds, index=index) -> None:
                    overall = 2 + ((done + min(float(part["duration_seconds"]), elapsed)) / source_duration) * 82
                    context.update(overall, "splitting", f"Encoding part {index} of {len(plan)}.")

                _run_ffmpeg(command, context, update_part_progress)
                if not output_path.is_file() or output_path.stat().st_size == 0:
                    raise RuntimeError(f"FFmpeg did not create part {index}.")
                video_paths.append(output_path)
                completed_seconds += part_duration

        if mode == "copy":
            video_paths = list(generated_paths)
        if not generated_paths:
            raise RuntimeError("FFmpeg completed without creating any video parts.")

        parts = []
        for index, part_path in enumerate(video_paths, start=1):
            context.check_cancelled()
            thumb_path = outputs_dir / f"{prefix}_part_{index:04d}.jpg"
            generated_paths.append(thumb_path)
            planned = plan[min(index - 1, len(plan) - 1)]
            seek_in_part = min(1.0, max(0.0, float(planned["duration_seconds"]) / 2))
            _thumbnail(ffmpeg_binary, part_path, thumb_path, seek_in_part, context)
            context.update(
                84 + (index / len(video_paths)) * 9,
                "thumbnails",
                f"Creating preview {index} of {len(video_paths)}.",
            )
            parts.append({
                "filename": part_path.name,
                "video_url": f"/outputs/{part_path.name}",
                "thumbnail_filename": thumb_path.name,
                "thumbnail_url": f"/outputs/{thumb_path.name}",
                "part_number": index,
                "start_seconds": planned["start_seconds"],
                "target_duration_seconds": planned["duration_seconds"],
            })

        context.check_cancelled()
        _write_archive(
            [{"path": outputs_dir / part["filename"]} for part in parts],
            archive_path,
            context,
        )
        return {
            "source_filename": source_path.name,
            "source_duration_seconds": source_duration,
            "segment_seconds": segment_seconds,
            "mode": mode,
            "expected_part_count": len(plan),
            "part_count": len(parts),
            "parts": parts,
            "archive_filename": archive_path.name,
            "archive_url": f"/outputs/{archive_path.name}",
        }
    except Exception:
        for path in generated_paths:
            path.unlink(missing_ok=True)
        archive_path.unlink(missing_ok=True)
        for path in temporary_paths:
            path.unlink(missing_ok=True)
        for path in outputs_dir.glob(f"{prefix}_part_*"):
            path.unlink(missing_ok=True)
        raise
