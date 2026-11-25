"""
AI Video Dubber & Translation Backend
FastAPI + faster-whisper + Google Gemini API (google-genai) + edge-tts + ffmpeg
Optimized for long videos (2+ hours) with real-time SSE progress streaming, VAD, GPU detection, and batching.
"""

import os
import sys
import re
import json
import uuid
import shutil
import asyncio
import random
import subprocess
import threading
import wave
import zipfile
import stat
import numpy as np
from pathlib import Path
from urllib.parse import quote, unquote, urlparse
from typing import List, Optional, Dict, Any

from fastapi import FastAPI, UploadFile, File, Form, Header, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from starlette.background import BackgroundTask
from pydantic import BaseModel, Field
from publisher import router as publisher_router

# Compatibility patch: PyAV 14+ / 19+ dropped 'metadata_errors' parameter in av.open(),
# which faster-whisper still passes. This patch safely removes it to avoid TypeError.
try:
    import av
    _orig_av_open = av.open
    def _patched_av_open(*args, **kwargs):
        kwargs.pop("metadata_errors", None)
        return _orig_av_open(*args, **kwargs)
    av.open = _patched_av_open
except Exception:
    pass

# Packaged builds keep writable media beside the user's Windows profile while
# loading the read-only web UI from PyInstaller's bundled resources.
BACKEND_ROOT = Path(__file__).resolve().parent
IS_FROZEN = getattr(sys, "frozen", False)
APP_ROOT = Path(sys.executable).resolve().parent if IS_FROZEN else BACKEND_ROOT.parent
DATA_DIR = Path(os.environ.get("AI_DUBBER_DATA_DIR", str(APP_ROOT))).expanduser().resolve()
RESOURCE_DIR = Path(getattr(sys, "_MEIPASS", APP_ROOT)) if IS_FROZEN else BACKEND_ROOT
UPLOADS_DIR = DATA_DIR / "uploads"
OUTPUTS_DIR = DATA_DIR / "outputs"
AUDIO_SEGMENTS_DIR = DATA_DIR / "audio_segments"
STATIC_DIR = RESOURCE_DIR / "static"

for folder in [UPLOADS_DIR, OUTPUTS_DIR, AUDIO_SEGMENTS_DIR, STATIC_DIR]:
    folder.mkdir(parents=True, exist_ok=True)

try:
    MAX_UPLOAD_BYTES = int(os.environ.get("AI_DUBBER_MAX_UPLOAD_BYTES", str(20 * 1024**3)))
except ValueError:
    MAX_UPLOAD_BYTES = 20 * 1024**3
MAX_UPLOAD_BYTES = max(1, MAX_UPLOAD_BYTES)
try:
    MAX_PROJECT_PACKAGE_BYTES = int(os.environ.get("AI_DUBBER_MAX_PACKAGE_BYTES", str(MAX_UPLOAD_BYTES * 2)))
except ValueError:
    MAX_PROJECT_PACKAGE_BYTES = MAX_UPLOAD_BYTES * 2
MAX_PROJECT_PACKAGE_BYTES = max(1, MAX_PROJECT_PACKAGE_BYTES)
ALLOWED_VIDEO_EXTENSIONS = {
    ".mp4", ".m4v", ".mov", ".mkv", ".webm", ".avi", ".wmv",
    ".mpg", ".mpeg", ".mpe", ".ts", ".mts", ".m2ts", ".3gp", ".3g2",
    ".flv", ".f4v", ".ogv", ".vob", ".mxf", ".m2v", ".asf", ".rm", ".rmvb",
}

app = FastAPI(
    title="AI Video Dubber & Translation API",
    description="Backend for AI Video Transcription, Translation, and Dubbing in Khmer",
    version="1.0.0"
)
app.include_router(publisher_router)

# CORS is only needed for the Angular development server. The packaged app is
# served by FastAPI on the same origin, and the API key is sent as a header.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:4200", "http://127.0.0.1:4200"],
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "X-Gemini-Api-Key", "X-Gemini-Model"],
)

# Mount static asset directories
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")
app.mount("/uploads", StaticFiles(directory=str(UPLOADS_DIR)), name="uploads")
app.mount("/outputs", StaticFiles(directory=str(OUTPUTS_DIR)), name="outputs")
app.mount("/audio_segments", StaticFiles(directory=str(AUDIO_SEGMENTS_DIR)), name="audio_segments")

# --- Pydantic Data Models ---

class SegmentItem(BaseModel):
    id: int
    start: float
    end: float
    original_text: str
    translated_text: Optional[str] = ""
    speaker_id: Optional[str] = None
    voice_profile: Optional[str] = "km-KH-PisethNeural"
    emotion: Optional[str] = "ធម្មតា"
    status: Optional[str] = "រង់ចាំ"
    audio_url: Optional[str] = None

class TranslateRequest(BaseModel):
    segments: List[SegmentItem]
    tone: Optional[str] = "conversational"
    glossary: Optional[str] = ""

class TranslatedSegment(BaseModel):
    id: int
    start: float
    end: float
    original_text: str
    translated_text: str
    voice_profile: str = "km-KH-PisethNeural"
    emotion: str = "ធម្មតា"

class TranslationResponse(BaseModel):
    segments: List[TranslatedSegment]


# Multi-Character Voice Archetypes Presets (Pitch and Rate Tuning)
CHARACTER_PRESETS = {
    "km-KH-PisethNeural": {"base": "km-KH-PisethNeural", "pitch": 0, "rate": 0, "name": "👨 Piseth (ប្រុស)"},
    "km-KH-SreymomNeural": {"base": "km-KH-SreymomNeural", "pitch": 0, "rate": 0, "name": "👩 Sreymom (ស្រី)"},
    "km-character-old-man": {"base": "km-KH-PisethNeural", "pitch": -16, "rate": -8, "name": "👴 លោកតា (មនុស្សចាស់)"},
    "km-character-old-woman": {"base": "km-KH-SreymomNeural", "pitch": -14, "rate": -8, "name": "👵 លោកយាយ (ស្រ្តីចំណាស់)"},
    "km-character-young-boy": {"base": "km-KH-PisethNeural", "pitch": +28, "rate": +10, "name": "👦 ក្មេងប្រុស"},
    "km-character-young-girl": {"base": "km-KH-SreymomNeural", "pitch": +32, "rate": +10, "name": "👧 ក្មេងស្រី"},
    "km-character-villain": {"base": "km-KH-PisethNeural", "pitch": -28, "rate": -4, "name": "🧙‍♂️ តួអាក្រក់ (Villain)"},
    "km-character-narrator": {"base": "km-KH-PisethNeural", "pitch": +2, "rate": +4, "name": "📢 អ្នកអត្ថាធិប្បាយ (Narrator)"},
}

class GenerateVoiceRequest(BaseModel):
    segments: List[SegmentItem]
    male_rate: Optional[int] = 0
    male_pitch: Optional[int] = 0
    female_rate: Optional[int] = 0
    female_pitch: Optional[int] = 0
    auto_fit: Optional[bool] = True # Automatic audio time-stretching to match segment duration

class ExportVideoRequest(BaseModel):
    video_filename: str
    segments: List[SegmentItem]
    audio_mode: Optional[str] = "sidechain" # "sidechain", "duck_static", "mute"
    mute_original_audio: bool = False
    background_volume: float = 0.15
    background_audio_url: Optional[str] = None
    burn_subtitles: bool = False
    sub_font_size: Optional[int] = 20
    sub_color: Optional[str] = "white" # "white", "yellow", "cyan"
    sub_style: Optional[str] = "box" # "box" (Netflix transparent box), "outline" (Black stroke)
    sub_position: Optional[str] = "bottom" # "bottom", "top", "center" 

class AutoEditRequest(BaseModel):
    video_filename: str
    segments: List[SegmentItem]
    clip_count: int = 3
    target_seconds: int = 30
    burn_captions: bool = True
    blur_bottom_captions: bool = False
    background_audio_url: Optional[str] = None

class DownloadUrlRequest(BaseModel):
    url: str

class DetectSpeakersRequest(BaseModel):
    video_filename: str
    segments: List[SegmentItem]

class RemoveVoiceRequest(BaseModel):
    video_filename: str

class TestKeyRequest(BaseModel):
    api_key: str
    model: Optional[str] = "gemini-3.8-flash"

class ProjectPackageRequest(BaseModel):
    project: Dict[str, Any]
    include_video: bool = True
    include_audio: bool = True


# --- Helper Functions & FFmpeg Detection ---

BIN_DIR = APP_ROOT / "bin" if IS_FROZEN else BACKEND_ROOT / "bin"
BIN_DIR.mkdir(parents=True, exist_ok=True)

def setup_ffmpeg_environment():
    """Ensure the backend's bundled FFmpeg executable is available on PATH."""
    ffmpeg_bin = BIN_DIR / ("ffmpeg.exe" if sys.platform.startswith("win") else "ffmpeg")
    if not ffmpeg_bin.exists():
        try:
            import imageio_ffmpeg
            src = imageio_ffmpeg.get_ffmpeg_exe()
            if src and os.path.exists(src):
                shutil.copy2(src, ffmpeg_bin)
        except Exception as e:
            print(f"Notice: Could not copy imageio_ffmpeg binary: {e}")

    bin_str = str(BIN_DIR)
    if bin_str not in os.environ.get("PATH", ""):
        os.environ["PATH"] = bin_str + os.pathsep + os.environ.get("PATH", "")

setup_ffmpeg_environment()


def get_ffmpeg_binary() -> str:
    """Locates the FFmpeg executable dynamically."""
    ffmpeg_local = BIN_DIR / ("ffmpeg.exe" if sys.platform.startswith("win") else "ffmpeg")
    if ffmpeg_local.exists():
        return str(ffmpeg_local)

    system_ffmpeg = shutil.which("ffmpeg")
    if system_ffmpeg:
        return system_ffmpeg

    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        pass

    candidates = [
        Path(os.environ.get("LOCALAPPDATA", "")) / "Microsoft" / "WinGet" / "Links" / "ffmpeg.exe",
        Path("C:/ffmpeg/bin/ffmpeg.exe"),
        Path("C:/Program Files/ffmpeg/bin/ffmpeg.exe"),
        Path("C:/Program Files (x86)/ffmpeg/bin/ffmpeg.exe")
    ]
    for c in candidates:
        if c.is_file() and c.exists():
            return str(c)

    return "ffmpeg"


def get_ffprobe_binary() -> Optional[str]:
    """Locates ffprobe executable if available."""
    system_ffprobe = shutil.which("ffprobe")
    if system_ffprobe:
        return system_ffprobe
    return None


def run_command_sync(cmd: List[str], cwd: Optional[Path] = None) -> subprocess.CompletedProcess:
    """Run an external command without invoking a shell."""
    try:
        return subprocess.run(
            cmd,
            stdin=subprocess.DEVNULL,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            cwd=str(cwd) if cwd is not None else None,
            check=True,
            text=True,
            encoding="utf-8",
            errors="replace"
        )
    except FileNotFoundError as e:
        raise RuntimeError(
            f"រកមិនឃើញកម្មវិធី ឬឯកសារ (File/Executable not found): {str(e)}"
        )
    except subprocess.CalledProcessError as e:
        error_msg = e.stderr or str(e)
        raise RuntimeError(f"បញ្ជាប្រព័ន្ធបរាជ័យ (Command failed): {error_msg}")


def resolve_video_path(filename: str) -> Path:
    """Resolve a stored video by basename, never by a caller-supplied path."""
    if not isinstance(filename, str) or not filename.strip():
        raise HTTPException(status_code=400, detail="A video filename is required.")

    clean_name = filename.strip().replace("\\", "/")
    if clean_name in {".", ".."} or Path(clean_name).name != clean_name:
        raise HTTPException(status_code=400, detail="Invalid video filename.")

    for root in (UPLOADS_DIR, OUTPUTS_DIR):
        root_path = root.resolve()
        candidate = (root_path / clean_name).resolve()
        try:
            candidate.relative_to(root_path)
        except ValueError:
            continue
        if candidate.is_file():
            return candidate

    raise HTTPException(status_code=404, detail="Video file not found.")


def resolve_audio_segment_path(audio_url: Optional[str]) -> Optional[Path]:
    """Resolve only locally generated audio segment URLs to files in their folder."""
    if not audio_url or not isinstance(audio_url, str):
        return None
    parsed = urlparse(audio_url)
    name = unquote(parsed.path).replace("\\", "/").rsplit("/", 1)[-1]
    if not name or name in {".", ".."} or Path(name).name != name:
        return None
    root = AUDIO_SEGMENTS_DIR.resolve()
    candidate = (root / name).resolve()
    try:
        candidate.relative_to(root)
    except ValueError:
        return None
    return candidate if candidate.is_file() else None


_diarization_pipeline = None
_diarization_lock = threading.Lock()


def get_diarization_pipeline():
    """Load optional pyannote diarization lazily; the standard app has no model dependency."""
    global _diarization_pipeline
    if _diarization_pipeline is not None:
        return _diarization_pipeline
    token = os.environ.get("AI_DUBBER_HF_TOKEN", "").strip()
    if not token:
        return None
    with _diarization_lock:
        if _diarization_pipeline is not None:
            return _diarization_pipeline
        from pyannote.audio import Pipeline
        pipeline = Pipeline.from_pretrained("pyannote/speaker-diarization-community-1", token=token)
        if pipeline is None:
            raise RuntimeError("Could not load pyannote pipeline. Check model access and AI_DUBBER_HF_TOKEN.")
        device = os.environ.get("AI_DUBBER_DIARIZATION_DEVICE", "cpu").strip().lower()
        if device == "cuda":
            import torch
            pipeline.to(torch.device("cuda"))
        _diarization_pipeline = pipeline
    return _diarization_pipeline


def extract_audio_from_video(video_path: Path, output_audio_path: Path):
    """Extracts 16kHz mono WAV audio from video using FFmpeg."""
    ffmpeg_bin = get_ffmpeg_binary()
    cmd = [
        ffmpeg_bin, "-y",
        "-i", str(video_path),
        "-vn",
        "-acodec", "pcm_s16le",
        "-ar", "16000",
        "-ac", "1",
        str(output_audio_path)
    ]
    run_command_sync(cmd)


def video_has_audio_stream(video_path: Path) -> bool:
    """Returns whether the source video contains an audio stream."""
    ffprobe_bin = get_ffprobe_binary()
    if ffprobe_bin:
        try:
            result = subprocess.run(
                [ffprobe_bin, "-v", "error", "-select_streams", "a:0",
                 "-show_entries", "stream=index", "-of", "csv=p=0", str(video_path)],
                stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
                encoding="utf-8", errors="replace", timeout=30
            )
            return result.returncode == 0 and bool(result.stdout.strip())
        except Exception:
            pass

    try:
        result = subprocess.run(
            [get_ffmpeg_binary(), "-hide_banner", "-i", str(video_path)],
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
            encoding="utf-8", errors="replace", timeout=30
        )
        return re.search(r"Stream #\d+:\d+.*Audio:", result.stderr, re.IGNORECASE) is not None
    except Exception:
        return False


def video_has_video_stream(video_path: Path) -> bool:
    """Returns whether a media file contains a decodable video stream."""
    ffprobe_bin = get_ffprobe_binary()
    if ffprobe_bin:
        try:
            result = subprocess.run(
                [ffprobe_bin, "-v", "error", "-select_streams", "v:0",
                 "-show_entries", "stream=index", "-of", "csv=p=0", str(video_path)],
                stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
                encoding="utf-8", errors="replace", timeout=30
            )
            return result.returncode == 0 and bool(result.stdout.strip())
        except Exception:
            pass

    try:
        result = subprocess.run(
            [get_ffmpeg_binary(), "-hide_banner", "-i", str(video_path)],
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
            encoding="utf-8", errors="replace", timeout=30
        )
        return re.search(r"Stream #\d+:\d+.*Video:", result.stderr, re.IGNORECASE) is not None
    except Exception:
        return False


def get_video_duration(video_path: Path) -> float:
    """Extracts video duration using ffprobe or ffmpeg."""
    ffprobe_bin = get_ffprobe_binary()
    if ffprobe_bin:
        try:
            cmd = [
                ffprobe_bin, "-v", "error",
                "-show_entries", "format=duration",
                "-of", "default=noprint_wrappers=1:nokey=1",
                str(video_path)
            ]
            res = subprocess.run(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                check=True,
                encoding="utf-8",
                errors="replace"
            )
            val = float(res.stdout.strip())
            if val > 0:
                return round(val, 2)
        except Exception:
            pass

    # Fallback to ffmpeg -i
    try:
        ffmpeg_bin = get_ffmpeg_binary()
        cmd = [ffmpeg_bin, "-i", str(video_path)]
        res = subprocess.run(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            encoding="utf-8",
            errors="replace"
        )
        match = re.search(r"Duration:\s*(\d+):(\d+):(\d+\.?\d*)", res.stderr)
        if match:
            h, m, s = match.groups()
            total_secs = int(h) * 3600 + int(m) * 60 + float(s)
            return round(total_secs, 2)
    except Exception:
        pass

    return 0.0


def estimate_pitch_f0(audio_data: np.ndarray, sr: int = 16000) -> float:
    """Estimates dominant fundamental frequency (F0) in Hz using FFT autocorrelation."""
    if len(audio_data) < sr * 0.08:
        return 0.0
    windowed = audio_data * np.hamming(len(audio_data))
    n = len(windowed)
    n_fft = 2 ** int(np.ceil(np.log2(2 * n - 1)))
    f = np.fft.rfft(windowed, n_fft)
    corr = np.fft.irfft(f * np.conj(f))[:n]
    if corr[0] == 0:
        return 0.0
    corr = corr / corr[0]
    min_lag = int(sr / 320)  # ~50 for 16kHz
    max_lag = min(int(sr / 75), n - 1)  # ~213 for 16kHz
    if min_lag >= max_lag:
        return 0.0
    peak_idx = np.argmax(corr[min_lag:max_lag]) + min_lag
    return float(sr / peak_idx) if corr[peak_idx] > 0.25 else 0.0


def detect_speaker_gender(audio_segment: np.ndarray, sr: int = 16000) -> str:
    """
    Classifies speaker as male or female based on acoustic fundamental pitch.
    Adult male median pitch: ~85Hz - 160Hz -> km-KH-PisethNeural.
    Adult female median pitch: ~165Hz - 260Hz -> km-KH-SreymomNeural.
    """
    frame_sz = int(sr * 0.1)  # 100ms frames
    pitches = []
    for i in range(0, len(audio_segment) - frame_sz, frame_sz):
        f0 = estimate_pitch_f0(audio_segment[i : i + frame_sz], sr)
        if f0 > 0:
            pitches.append(f0)

    if not pitches:
        return "km-KH-PisethNeural"

    median_pitch = float(np.median(pitches))
    return "km-KH-SreymomNeural" if median_pitch >= 165.0 else "km-KH-PisethNeural"


# Lazy load whisper model with GPU acceleration when available
_whisper_model = None
_whisper_model_lock = threading.Lock()
WHISPER_MODEL_NAME = os.environ.get("AI_DUBBER_WHISPER_MODEL", "base").strip() or "base"
WHISPER_DEVICE_SETTING = os.environ.get("AI_DUBBER_WHISPER_DEVICE", "auto").strip().lower()

def get_whisper_instance():
    """Load one shared faster-whisper model with CTranslate2 CUDA detection."""
    global _whisper_model
    if _whisper_model is not None:
        return _whisper_model

    with _whisper_model_lock:
        if _whisper_model is not None:
            return _whisper_model

        from faster_whisper import WhisperModel
        cuda_devices = 0
        try:
            import ctranslate2
            cuda_devices = ctranslate2.get_cuda_device_count()
        except Exception as e:
            print(f"Notice: CTranslate2 CUDA detection unavailable; using CPU: {e}")

        use_cuda = WHISPER_DEVICE_SETTING != "cpu" and cuda_devices > 0
        if WHISPER_DEVICE_SETTING not in {"auto", "cpu", "cuda"}:
            print(f"Notice: Unknown AI_DUBBER_WHISPER_DEVICE={WHISPER_DEVICE_SETTING!r}; using auto mode.")
            use_cuda = cuda_devices > 0

        # CTranslate2 can detect the GPU even when the CUDA runtime libraries
        # needed for inference are missing. Catch this before loading the CUDA
        # model so transcription can fall back to the working CPU path.
        if use_cuda and os.name == "nt":
            try:
                import ctypes
                ctypes.WinDLL("cublas64_12.dll")
            except OSError as e:
                print(f"Notice: CUDA cuBLAS runtime is unavailable; using CPU: {e}")
                use_cuda = False

        if WHISPER_DEVICE_SETTING == "cuda" and cuda_devices == 0:
            print("Notice: CUDA was requested but no CTranslate2 CUDA device is available; using CPU.")

        if use_cuda:
            try:
                _whisper_model = WhisperModel(
                    WHISPER_MODEL_NAME,
                    device="cuda",
                    compute_type=os.environ.get("AI_DUBBER_WHISPER_COMPUTE_TYPE", "float16"),
                )
            except Exception as e:
                print(f"Notice: CUDA model loading failed; retrying on CPU: {e}")

        if _whisper_model is None:
            _whisper_model = WhisperModel(
                WHISPER_MODEL_NAME,
                device="cpu",
                compute_type=os.environ.get("AI_DUBBER_WHISPER_COMPUTE_TYPE_CPU", "int8"),
            )
    return _whisper_model


# --- API Routes ---

@app.get("/")
async def serve_index():
    """Serves the Angular UI when built, with the legacy page as a fallback."""
    index_file = STATIC_DIR / "app" / "index.html"
    if not index_file.exists():
        index_file = STATIC_DIR / "index.html"
    if not index_file.exists():
        raise HTTPException(status_code=404, detail="រកមិនឃើញឯកសារ index.html ទេ")
    return FileResponse(str(index_file))


@app.get("/api/health")
async def health_check():
    """Report whether the local app can accept work without exposing secrets."""
    ffmpeg_binary = get_ffmpeg_binary()
    ffmpeg_available = Path(ffmpeg_binary).is_file() or shutil.which(ffmpeg_binary) is not None
    try:
        free_bytes = shutil.disk_usage(OUTPUTS_DIR).free
    except OSError:
        free_bytes = None

    return {
        "status": "ok" if ffmpeg_available else "degraded",
        "ffmpeg_available": ffmpeg_available,
        "whisper_model_loaded": _whisper_model is not None,
        "upload_limit_bytes": MAX_UPLOAD_BYTES,
        "storage_free_bytes": free_bytes,
        "storage_writable": os.access(UPLOADS_DIR, os.W_OK) and os.access(OUTPUTS_DIR, os.W_OK),
    }


@app.post("/api/upload")
async def upload_video(file: UploadFile = File(...)):
    """Uploads a video file and prepares it for processing."""
    file_id = str(uuid.uuid4())[:8]
    # Normalize both Windows and POSIX separators before taking the client name.
    original_name = str(file.filename or "video").replace("\\", "/").rsplit("/", 1)[-1]
    extension = Path(original_name).suffix.lower()
    if extension not in ALLOWED_VIDEO_EXTENSIONS:
        raise HTTPException(status_code=415, detail="Unsupported video format.")

    original_stem = re.sub(r'[<>:"/\\|?*\x00-\x1f]', "_", Path(original_name).stem).strip(" .") or "video"
    original_name = f"{original_stem[:max(1, 180 - len(extension))]}{extension}"
    sanitized_name = f"{file_id}_{original_name.replace(' ', '_')}"
    target_path = UPLOADS_DIR / sanitized_name
    partial_path = UPLOADS_DIR / f".{file_id}.upload"

    def save_uploaded_file():
        total_bytes = 0
        with open(partial_path, "wb") as buffer:
            while True:
                chunk = file.file.read(1024 * 1024)
                if not chunk:
                    break
                total_bytes += len(chunk)
                if total_bytes > MAX_UPLOAD_BYTES:
                    raise OverflowError("Upload exceeds configured size limit.")
                buffer.write(chunk)
        if total_bytes == 0:
            raise ValueError("The uploaded file is empty.")
        os.replace(partial_path, target_path)

    try:
        await asyncio.to_thread(save_uploaded_file)
    except OverflowError:
        partial_path.unlink(missing_ok=True)
        raise HTTPException(
            status_code=413,
            detail=f"Video exceeds the {MAX_UPLOAD_BYTES / (1024**3):.2f} GiB upload limit.",
        )
    except ValueError as exc:
        partial_path.unlink(missing_ok=True)
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception:
        partial_path.unlink(missing_ok=True)
        target_path.unlink(missing_ok=True)
        raise

    duration = await asyncio.to_thread(get_video_duration, target_path)
    has_video_stream = await asyncio.to_thread(video_has_video_stream, target_path)
    if duration <= 0 or not has_video_stream:
        target_path.unlink(missing_ok=True)
        raise HTTPException(status_code=415, detail="The uploaded file is not a readable video.")

    return {
        "success": True,
        "message": "បានផ្ទុកវីដេអូដោយជោគជ័យ!",
        "filename": sanitized_name,
        "video_url": f"/uploads/{quote(sanitized_name, safe='')}",
        "duration": duration
    }


@app.post("/api/export-project-package")
async def export_project_package(request: ProjectPackageRequest):
    """Create a portable ZIP project with an explicit JSON manifest and optional media."""
    project = json.loads(json.dumps(request.project, ensure_ascii=False))
    if not isinstance(project.get("segments", []), list):
        raise HTTPException(status_code=400, detail="Project segments must be a list.")
    archive_path = OUTPUTS_DIR / f"project_{uuid.uuid4().hex}.dubpack"
    try:
        media_entries = []
        if request.include_video and project.get("video_filename"):
            source_video = resolve_video_path(str(project["video_filename"]))
            archive_name = f"media/video/{source_video.name}"
            project["video_filename"] = f"package://{archive_name}"
            media_entries.append((source_video, archive_name))

        for segment in project.get("segments", []):
            if not isinstance(segment, dict) or not segment.get("audio_url"):
                continue
            if not request.include_audio:
                continue
            audio_path = resolve_audio_segment_path(segment.get("audio_url"))
            if not audio_path:
                raise HTTPException(status_code=400, detail="A referenced generated audio clip is missing or invalid.")
            archive_name = f"media/audio/{audio_path.name}"
            segment["audio_url"] = f"package://{archive_name}"
            media_entries.append((audio_path, archive_name))

        if request.include_audio and project.get("background_audio_url"):
            background_path = resolve_audio_segment_path(project["background_audio_url"])
            if not background_path:
                raise HTTPException(status_code=400, detail="The separated background track is missing or invalid.")
            archive_name = f"media/audio/{background_path.name}"
            project["background_audio_url"] = f"package://{archive_name}"
            media_entries.append((background_path, archive_name))

        unique_media = {archive_name: source for source, archive_name in media_entries}
        manifest_bytes = json.dumps(project, ensure_ascii=False, indent=2).encode("utf-8")
        expected_size = len(manifest_bytes) + sum(source.stat().st_size for source in unique_media.values())
        expected_size += 4096 + len(unique_media) * 1024  # ZIP member headers and paths.
        if expected_size > MAX_PROJECT_PACKAGE_BYTES:
            raise HTTPException(status_code=413, detail="Project package exceeds AI_DUBBER_MAX_PACKAGE_BYTES.")

        with zipfile.ZipFile(archive_path, "w", compression=zipfile.ZIP_STORED, allowZip64=True) as package:
            package.writestr("project.json", manifest_bytes)
            written = set()
            for source, archive_name in media_entries:
                if archive_name not in written:
                    package.write(source, archive_name)
                    written.add(archive_name)
        return {
            "success": True,
            "download_url": f"/api/project-packages/{archive_path.name}",
        }
    except HTTPException:
        archive_path.unlink(missing_ok=True)
        raise
    except Exception as e:
        archive_path.unlink(missing_ok=True)
        raise HTTPException(status_code=500, detail=f"Could not create project package: {e}")


@app.get("/api/project-packages/{filename}")
async def download_project_package(filename: str):
    if not re.fullmatch(r"project_[a-f0-9]{32}\.dubpack", filename):
        raise HTTPException(status_code=400, detail="Invalid project package filename.")
    package_path = OUTPUTS_DIR / filename
    if not package_path.is_file():
        raise HTTPException(status_code=404, detail="Project package is no longer available.")
    return FileResponse(
        package_path,
        media_type="application/zip",
        filename="dubbing_project.dubpack",
        background=BackgroundTask(lambda: package_path.unlink(missing_ok=True)),
    )


@app.post("/api/import-project-package")
async def import_project_package(file: UploadFile = File(...)):
    """Read a .dubpack without using extractall; reject paths, links and oversized members."""
    package_path = UPLOADS_DIR / f"incoming_{uuid.uuid4().hex}.dubpack"
    created_files = []
    max_member_bytes = MAX_PROJECT_PACKAGE_BYTES
    try:
        total_upload = 0
        with package_path.open("wb") as target:
            while True:
                chunk = await file.read(1024 * 1024)
                if not chunk:
                    break
                total_upload += len(chunk)
                if total_upload > MAX_PROJECT_PACKAGE_BYTES:
                    raise HTTPException(status_code=413, detail="Project package exceeds the configured upload limit.")
                target.write(chunk)

        package_id = uuid.uuid4().hex[:8]
        with zipfile.ZipFile(package_path, "r") as package:
            infos = package.infolist()
            if len(infos) > 100000:
                raise HTTPException(status_code=413, detail="Project package contains too many files.")
            total_uncompressed = 0
            safe_infos = {}
            for info in infos:
                name = info.filename.replace("\\", "/")
                parts = name.split("/")
                mode = (info.external_attr >> 16) & 0xFFFF
                if name.startswith("/") or any(part in {"", ".", ".."} for part in parts) or stat.S_ISLNK(mode):
                    raise HTTPException(status_code=400, detail="Project package contains an unsafe path.")
                if name != "project.json" and not (name.startswith("media/video/") or name.startswith("media/audio/")):
                    raise HTTPException(status_code=400, detail="Project package contains an unsupported entry.")
                if name != "project.json" and (len(parts) != 3 or not re.fullmatch(r"[A-Za-z0-9._ -]{1,180}", parts[-1])):
                    raise HTTPException(status_code=400, detail="Project package contains an invalid media filename.")
                if name in safe_infos:
                    raise HTTPException(status_code=400, detail="Project package contains duplicate entries.")
                if info.file_size > max_member_bytes:
                    raise HTTPException(status_code=413, detail="A project media item exceeds the configured size limit.")
                total_uncompressed += info.file_size
                if total_uncompressed > MAX_PROJECT_PACKAGE_BYTES:
                    raise HTTPException(status_code=413, detail="Project package expands beyond the configured size limit.")
                safe_infos[name] = info
            manifest_info = safe_infos.get("project.json")
            if not manifest_info or manifest_info.file_size > 50 * 1024 * 1024:
                raise HTTPException(status_code=400, detail="Project package is missing a valid project.json manifest.")
            try:
                project = json.loads(package.read(manifest_info).decode("utf-8"))
            except Exception as e:
                raise HTTPException(status_code=400, detail=f"Project manifest is invalid: {e}")
            if not isinstance(project, dict) or not isinstance(project.get("segments"), list):
                raise HTTPException(status_code=400, detail="Project manifest has an invalid structure.")

            path_map = {}
            for archive_name, info in safe_infos.items():
                if archive_name == "project.json":
                    continue
                folder, _, old_name = archive_name.rpartition("/")
                new_name = f"pkg_{package_id}_{old_name}"
                target_root = UPLOADS_DIR if folder == "media/video" else AUDIO_SEGMENTS_DIR
                target = target_root / new_name
                with package.open(info, "r") as source, target.open("wb") as dest:
                    shutil.copyfileobj(source, dest, length=1024 * 1024)
                created_files.append(target)
                path_map[f"package://{archive_name}"] = new_name

            video_ref = project.get("video_filename")
            if isinstance(video_ref, str) and video_ref.startswith("package://"):
                local_video_name = path_map.get(video_ref)
                if not local_video_name:
                    raise HTTPException(status_code=400, detail="The project references a video that is not in the package.")
                video_path = resolve_video_path(local_video_name)
                if video_path.suffix.lower() not in ALLOWED_VIDEO_EXTENSIONS or not video_has_video_stream(video_path):
                    raise HTTPException(status_code=415, detail="The packaged video is not a supported readable video.")
                project["video_filename"] = local_video_name

            for segment in project["segments"]:
                if not isinstance(segment, dict):
                    raise HTTPException(status_code=400, detail="Project contains an invalid segment.")
                audio_ref = segment.get("audio_url")
                if isinstance(audio_ref, str) and audio_ref.startswith("package://"):
                    local_audio_name = path_map.get(audio_ref)
                    if not local_audio_name:
                        raise HTTPException(status_code=400, detail="A generated audio clip referenced by the project is missing.")
                    segment["audio_url"] = f"/audio_segments/{quote(local_audio_name, safe='')}"
            background_ref = project.get("background_audio_url")
            if isinstance(background_ref, str) and background_ref.startswith("package://"):
                local_audio_name = path_map.get(background_ref)
                if not local_audio_name:
                    raise HTTPException(status_code=400, detail="The separated background track referenced by the project is missing.")
                project["background_audio_url"] = f"/audio_segments/{quote(local_audio_name, safe='')}"
        return {"success": True, "project": project}
    except zipfile.BadZipFile:
        for target in created_files:
            target.unlink(missing_ok=True)
        raise HTTPException(status_code=400, detail="This is not a valid .dubpack archive.")
    except HTTPException:
        for target in created_files:
            target.unlink(missing_ok=True)
        raise
    except Exception as e:
        for target in created_files:
            target.unlink(missing_ok=True)
        raise HTTPException(status_code=500, detail=f"Could not import project package: {e}")
    finally:
        package_path.unlink(missing_ok=True)
        await file.close()


@app.post("/api/transcribe-stream")
async def transcribe_stream(
    filename: str = Form(...),
    duration: float = Form(0.0),
    start_offset: float = Form(0.0),
    segment_id_start: int = Form(1),
):
    """
    Real-time Server-Sent Events (SSE) streaming endpoint for transcription.
    Runs Whisper in a dedicated worker thread with an asyncio-compatible Queue.
    Pushes progress and segments instantly without pre-extracting WAV files.
    """
    import queue
    import threading

    video_path = resolve_video_path(filename)
    if not video_path.exists():
        raise HTTPException(status_code=404, detail="រកមិនឃើញឯកសារវីដេអូទេ!")

    total_video_duration = duration if duration > 0 else (await asyncio.to_thread(get_video_duration, video_path) or 1.0)

    async def event_generator():
        # Immediate buffer flush and initialization
        yield f": {' ' * 1024}\n\n"
        yield f"data: {json.dumps({'type': 'init', 'total_duration': total_video_duration})}\n\n"

        event_q = queue.Queue()

        def whisper_worker():
            audio_reader = None
            try:
                event_q.put({"type": "status", "message": "កំពុងផ្ទុកម៉ូដែល AI Whisper..."})
                model = get_whisper_instance()

                # Fast audio extraction if ffmpeg is available (much faster than decoding video frames in Python)
                audio_extracted = UPLOADS_DIR / f"temp_extract_{uuid.uuid4().hex[:8]}.wav"
                target_media = str(video_path)
                try:
                    event_q.put({"type": "status", "message": "កំពុងស្រង់សំឡេងចេញពីវីដេអូ..."})
                    extract_audio_from_video(video_path, audio_extracted)
                    if audio_extracted.exists():
                        target_media = str(audio_extracted)
                except Exception:
                    target_media = str(video_path)

                event_q.put({"type": "status", "message": "កំពុងស្តាប់ និងស្រង់អត្ថបទដើម..."})
                # vad_filter=False prevents the 225,000-pass Silero VAD CPU freeze on 2-hour files!
                transcribe_options = {"beam_size": 1, "vad_filter": False}
                resume_from = max(0.0, min(float(start_offset or 0), max(0.0, total_video_duration - 0.05)))
                if resume_from > 0:
                    # faster-whisper expects alternating start/end timestamps, not
                    # dictionaries. A dict here breaks every resumed transcription.
                    transcribe_options["clip_timestamps"] = [resume_from, total_video_duration]
                segments_gen, info = model.transcribe(target_media, **transcribe_options)

                detected_duration = info.duration if hasattr(info, 'duration') and info.duration else total_video_duration
                event_q.put({"type": "init", "total_duration": detected_duration, "language": getattr(info, 'language', 'unknown')})

                # Keep the WAV on disk and read only each segment's frames instead of
                # materializing hours of audio as a large float32 array in RAM.
                sr = 16000
                if audio_extracted.exists():
                    try:
                        audio_reader = wave.open(str(audio_extracted), "rb")
                        sr = audio_reader.getframerate()
                    except Exception:
                        audio_reader = None

                segment_count = 0
                seg_id = max(1, int(segment_id_start or 1))
                for seg in segments_gen:
                    text_cleaned = seg.text.strip()
                    if not text_cleaned:
                        continue
                    # A resumed decode starts at the last saved caption boundary.
                    if resume_from > 0 and seg.end <= resume_from + 0.05:
                        continue

                    # Auto-detect speaker gender (Male: Piseth vs Female: Sreymom) from audio pitch
                    detected_voice = "km-KH-PisethNeural"
                    if audio_reader is not None:
                        s_idx = max(0, int(seg.start * sr))
                        e_idx = min(audio_reader.getnframes(), int(seg.end * sr))
                        if e_idx > s_idx:
                            audio_reader.setpos(s_idx)
                            raw_segment = audio_reader.readframes(e_idx - s_idx)
                            segment_audio = np.frombuffer(raw_segment, dtype=np.int16).astype(np.float32) / 32768.0
                            detected_voice = detect_speaker_gender(segment_audio, sr=sr)

                    item = {
                        "id": seg_id,
                        "start": round(seg.start, 2),
                        "end": round(seg.end, 2),
                        "original_text": text_cleaned,
                        "translated_text": "",
                        "voice_profile": detected_voice,
                        "emotion": "ធម្មតា",
                        "status": "រង់ចាំការបកប្រែ",
                        "audio_url": None
                    }
                    segment_count += 1
                    pct = min(99.5, round((seg.end / detected_duration) * 100, 1)) if detected_duration > 0 else 0
                    event_q.put({
                        "type": "progress",
                        "percent": pct,
                        "current_time": round(seg.end, 2),
                        "total_duration": round(detected_duration, 2),
                        "segment": item
                    })
                    seg_id += 1

                if segment_count == 0 and resume_from <= 0:
                    item = {
                        "id": 1,
                        "start": 0.0,
                        "end": round(detected_duration, 2),
                        "original_text": "(រកមិនឃើញសំឡេងនិយាយនៅក្នុងវីដេអូ)",
                        "translated_text": "",
                        "voice_profile": "km-KH-PisethNeural",
                        "emotion": "ធម្មតា",
                        "status": "រង់ចាំការបកប្រែ",
                        "audio_url": None
                    }
                    event_q.put({"type": "progress", "percent": 100, "current_time": detected_duration,
                                 "total_duration": detected_duration, "segment": item})
                    segment_count = 1

                # Segments have already been streamed one by one; avoid sending a
                # second movie-sized JSON copy in the final event.
                event_q.put({"type": "complete", "total_count": segment_count})

            except Exception as e:
                error_msg = str(e)
                if "[WinError 2]" in error_msg or "The system cannot find the file specified" in error_msg:
                    error_msg = "រកមិនឃើញ FFmpeg ទេ! សូមដំណើរការ 'pip install imageio-ffmpeg' រួចចាប់ផ្តើមម្តងទៀត។"
                event_q.put({"type": "error", "message": error_msg})
            finally:
                if audio_reader is not None:
                    try:
                        audio_reader.close()
                    except Exception:
                        pass
                if 'audio_extracted' in locals() and audio_extracted.exists():
                    try:
                        audio_extracted.unlink()
                    except Exception:
                        pass
                event_q.put(None)  # Sentinel to terminate

        worker_thread = threading.Thread(target=whisper_worker, daemon=True)
        worker_thread.start()

        loop = asyncio.get_running_loop()

        while True:
            try:
                # Wait for items non-blockingly with a short timeout to send heartbeats
                item = await loop.run_in_executor(None, lambda: event_q.get(timeout=0.5))
            except queue.Empty:
                # Send periodic heartbeat to keep the stream moving
                yield f": ping\n\n"
                continue

            if item is None:
                break

            yield f"data: {json.dumps(item, ensure_ascii=False)}\n\n"
            await asyncio.sleep(0.01)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )


@app.post("/api/transcribe")
async def transcribe_video(filename: str = Form(...)):
    """Synchronous fallback endpoint for transcription."""
    video_path = resolve_video_path(filename)
    if not video_path.exists():
        raise HTTPException(
            status_code=404,
            detail="រកមិនឃើញឯកសារវីដេអូដែលបានបញ្ជាក់ទេ! សូមផ្ទុកវីដេអូជាមុនសិន។"
        )

    try:
        model = get_whisper_instance()
        audio_extracted = UPLOADS_DIR / f"temp_extract_{uuid.uuid4().hex[:8]}.wav"

        target_media = str(video_path)
        try:
            await asyncio.to_thread(extract_audio_from_video, video_path, audio_extracted)
            if audio_extracted.exists():
                target_media = str(audio_extracted)
        except Exception:
            target_media = str(video_path)

        segments_gen, info = model.transcribe(
            target_media,
            beam_size=1,
            vad_filter=True,
            vad_parameters=dict(min_silence_duration_ms=400)
        )

        results = []
        for i, seg in enumerate(segments_gen, start=1):
            text_cleaned = seg.text.strip()
            if not text_cleaned:
                continue
            results.append({
                "id": i,
                "start": round(seg.start, 2),
                "end": round(seg.end, 2),
                "original_text": text_cleaned,
                "translated_text": "",
                "voice_profile": "km-KH-PisethNeural",
                "emotion": "ធម្មតា",
                "status": "រង់ចាំការបកប្រែ",
                "audio_url": None
            })

        if not results:
            results.append({
                "id": 1,
                "start": 0.0,
                "end": round(info.duration, 2) if hasattr(info, 'duration') and info.duration else 5.0,
                "original_text": "(រកមិនឃើញសំឡេងនិយាយនៅក្នុងវីដេអូ)",
                "translated_text": "",
                "voice_profile": "km-KH-PisethNeural",
                "emotion": "ធម្មតា",
                "status": "រង់ចាំការបកប្រែ",
                "audio_url": None
            })

        return {
            "success": True,
            "message": "ការបម្លែងសំឡេងទៅជាអត្ថបទបានជោគជ័យ!",
            "detected_language": getattr(info, 'language', 'unknown'),
            "segments": results
        }

    except Exception as e:
        error_msg = str(e)
        if "[WinError 2]" in error_msg or "The system cannot find the file specified" in error_msg:
            error_msg = "រកមិនឃើញកម្មវិធី FFmpeg លើកុំព្យូទ័រទេ! សូមដំណើរការ 'pip install imageio-ffmpeg' រួចសាកល្បងម្តងទៀត។"
        raise HTTPException(
            status_code=500,
            detail=f"កំហុសក្នុងការបម្លែងអត្ថបទ (Transcription Error): {error_msg}"
        )


@app.post("/api/test-key")
async def test_gemini_key(request: TestKeyRequest):
    """Verifies that the provided Gemini API key is valid and can generate content."""
    clean_key = request.api_key.strip().strip('"').strip("'").strip()
    if not clean_key:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="សូមបញ្ចូល Gemini API Key ជាមុនសិន!"
        )

    try:
        from google import genai
        from google.genai import types
        client = genai.Client(api_key=clean_key)

        test_models = []
        if request.model and request.model.strip():
            test_models.append(request.model.strip())
        test_models.extend(["gemini-3.8-flash", "gemini-3.5-flash", "gemini-3.5-flash-lite", "gemini-3.1-flash-lite"])

        working_model = None
        last_err = None

        for m in test_models:
            if not m:
                continue
            try:
                response = await asyncio.to_thread(
                    client.models.generate_content,
                    model=m,
                    contents="Hello",
                    config=types.GenerateContentConfig(
                        automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True)
                    )
                )
                if response and response.text:
                    working_model = m
                    break
            except Exception as e:
                last_err = e
                print(f"Test key model {m} notice: {e}")
                continue

        if working_model:
            return {
                "success": True,
                "message": f"សោ API Key ត្រឹមត្រូវ និងដំណើរការល្អជាមួយម៉ូដែល '{working_model}'!",
                "working_model": working_model
            }
        else:
            err_msg = str(last_err) if last_err else "សោមិនត្រឹមត្រូវ"
            error_upper = err_msg.upper()
            temporary_service_error = any(
                marker in error_upper
                for marker in ("503", "UNAVAILABLE", "429", "RESOURCE_EXHAUSTED", "500", "INTERNAL", "502", "504")
            )
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE if temporary_service_error else status.HTTP_401_UNAUTHORIZED,
                detail=(
                    f"Gemini កំពុងរវល់ ឬលើសកម្រិតសំណើ សូមសាកល្បងម្ដងទៀត: {err_msg}"
                    if temporary_service_error
                    else f"សោ API Key មិនដំណើរការទេ: {err_msg}"
                )
            )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"កំហុសក្នុងការតេស្តសោ (API Key Test Error): {str(e)}"
        )


@app.post("/api/translate")
async def translate_segments(
    request: TranslateRequest,
    x_gemini_api_key: Optional[str] = Header(None, alias="X-Gemini-Api-Key"),
    x_gemini_model: Optional[str] = Header("gemini-3.8-flash", alias="X-Gemini-Model")
):
    """Stateless translation endpoint with automatic multi-model fallback."""
    if not x_gemini_api_key or not x_gemini_api_key.strip():
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="សូមបញ្ចូល Gemini API Key នៅក្នុងផ្ទាំង 'ការកំណត់' ជាមុនសិន! (Gemini API Key missing)"
        )

    clean_api_key = x_gemini_api_key.strip().strip('"').strip("'").strip()
    if not clean_api_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Gemini API Key មិនអាចទទេបានទេ! សូមពិនិត្យមើលសោរបស់អ្នកក្នុង 'ការកំណត់'។"
        )

    if not request.segments:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="មិនមាន Segment សម្រាប់ធ្វើការបកប្រែទេ!"
        )

    try:
        from google import genai
        from google.genai import types

        client = genai.Client(api_key=clean_api_key)

        tone_map = {
            "conversational": "របៀបនិយាយបែបសន្ទនាធម្មជាតិ រលូន សមរម្យសម្រាប់ការសន្ទនាពិតៗ (Natural Conversational).",
            "storytelling": "របៀបនិទានរឿង ពិពណ៌នាទិដ្ឋភាព ប្រើពាក្យបែបអក្សរសិល្ប៍ ឬសង្ខេបរឿងភាពយន្ត (Dramatic Storytelling / Narration).",
            "formal": "របៀបផ្លូវការ ព័ត៌មាន ឬឯកសារវិទ្យាសាស្ត្រ បច្ចេកទេស ច្បាស់លាស់ត្រឹមត្រូវ (Formal / Professional / Documentary).",
            "comedy": "របៀបកំប្លុកកំប្លែង ក្រមិចក្រមើម ពាក្យសម័យទំនើប ស្និទ្ធស្នាល និងសប្បាយរីករាយ (Humorous / Entertaining)."
        }
        chosen_tone_desc = tone_map.get(request.tone, tone_map["conversational"])

        glossary_note = ""
        if request.glossary and request.glossary.strip():
            glossary_note = (
                f"\n6. វចនានុក្រមពាក្យពិសេស (Custom Glossary): សូមប្រកាន់ខ្ជាប់នូវពាក្យបច្ចេកទេស និងឈ្មោះដូចខាងក្រោមជាដាច់ខាត:\n"
                f"{request.glossary.strip()}\n"
            )

        system_instruction = (
            "អ្នកជាអ្នកជំនាញបកប្រែ និងបញ្ចូលសំឡេងភាពយន្តខ្មែរអាជីព (Professional Khmer AI Dubbing Specialist).\n"
            "ភារកិច្ចរបស់អ្នកគឺបកប្រែបញ្ជី segment នីមួយៗទៅជា 'ភាសាខ្មែរ' (Khmer Language) ឱ្យមានលក្ខណៈធម្មជាតិ ពិរោះស្តាប់ សមរម្យសម្រាប់ការសន្ទនាពិតៗ។\n\n"
            "លក្ខខណ្ឌសំខាន់បំផុត:\n"
            "1. ប្រវែងពាក្យខ្មែរត្រូវតែស៊ីគ្នានឹងថិរវេលា (end - start timestamps) ដើម្បីកុំឱ្យការបញ្ចូលសំឡេង (TTS) និយាយលឿនពេក ឬលើសពេលវេលា។\n"
            "2. រក្សាអត្ថន័យ និងបរិបទដើមឱ្យបានត្រឹមត្រូវ។\n"
            "3. កំណត់ទម្រង់សំឡេង voice_profile៖ ជ្រើសរើស 'km-KH-PisethNeural' (សម្រាប់តួអង្គប្រុស) ឬ 'km-KH-SreymomNeural' (សម្រាប់តួអង្គស្រី)។\n"
            "4. កំណត់ emotion នៃប្រយោគនីមួយៗ (ឧទាហរណ៍៖ 'ធម្មតា', 'រំភើប', 'ក្រៀមក្រំ', 'ខឹង', 'កំប្លែង', 'បន្ទាន់')។\n"
            f"5. ទឹកដមសំនៀងបកប្រែ: {chosen_tone_desc}\n"
            f"{glossary_note}"
            "7. ត្រូវតែប្រគល់ទិន្នន័យត្រឡប់មកវិញតាមទម្រង់ Structured JSON ដូចកំណត់ក្នុង Schema។"
        )

        # Current Gemini models, ordered by general capability then efficiency.
        candidate_models = [
            "gemini-3.8-flash",
            "gemini-3.5-flash",
            "gemini-3.5-flash-lite",
            "gemini-3.1-flash-lite"
        ]

        if x_gemini_model and x_gemini_model.strip():
            clean_m = x_gemini_model.strip()
            if clean_m not in candidate_models:
                clean_m = "gemini-3.8-flash"
            if clean_m in candidate_models:
                candidate_models.remove(clean_m)
            candidate_models.insert(0, clean_m)

        BATCH_SIZE = 40
        all_translated_segments = []

        for start_idx in range(0, len(request.segments), BATCH_SIZE):
            chunk = request.segments[start_idx : start_idx + BATCH_SIZE]
            segments_payload = [
                {
                    "id": seg.id,
                    "start": seg.start,
                    "end": seg.end,
                    "original_text": seg.original_text,
                    "voice_profile": seg.voice_profile or "km-KH-PisethNeural"
                }
                for seg in chunk
            ]

            prompt_content = (
                f"សូមបកប្រែ Segments ដូចខាងក្រោមជាភាសាខ្មែរ:\n\n"
                f"{json.dumps(segments_payload, ensure_ascii=False, indent=2)}"
            )

            response = None
            last_model_err = None
            for model_name in candidate_models:
                # The SDK retries transient failures internally. These extra retries
                # cover sustained short capacity spikes before falling back to a
                # different model, with jitter to avoid synchronized retries.
                for retry_index in range(3):
                    try:
                        response = await asyncio.to_thread(
                            client.models.generate_content,
                            model=model_name,
                            contents=[system_instruction, prompt_content],
                            config=types.GenerateContentConfig(
                                response_mime_type="application/json",
                                response_schema=TranslationResponse,
                                temperature=0.2,
                                automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True),
                            )
                        )
                        if response and response.text:
                            break
                        last_model_err = RuntimeError(f"Model {model_name} returned an empty response")
                        break
                    except Exception as m_err:
                        last_model_err = m_err
                        err_msg = str(m_err)
                        print(f"Notice: Translation attempt with model {model_name} failed: {err_msg}")
                        if "API_KEY_INVALID" in err_msg:
                            raise m_err
                        error_upper = err_msg.upper()
                        is_temporary_capacity_error = any(
                            marker in error_upper
                            for marker in ("503", "UNAVAILABLE", "429", "RESOURCE_EXHAUSTED", "500", "INTERNAL", "502", "504", "DEADLINE_EXCEEDED")
                        )
                        if is_temporary_capacity_error and retry_index < 2:
                            delay = (2 ** retry_index) + random.uniform(0.1, 0.6)
                            print(f"Retrying model {model_name} in {delay:.1f}s (retry {retry_index + 1}/2)")
                            await asyncio.sleep(delay)
                            continue
                        break
                if response and response.text:
                    break

            if not response or not response.text:
                raise RuntimeError(f"មិនអាចហៅម៉ូដែល Gemini បានទេ (Model Error): {str(last_model_err)}")

            translated_data = json.loads(response.text)
            all_translated_segments.extend(translated_data.get("segments", []))

        trans_dict = {item["id"]: item for item in all_translated_segments}

        updated_segments = []
        for seg in request.segments:
            trans_info = trans_dict.get(seg.id, {})
            updated_segments.append(SegmentItem(
                id=seg.id,
                start=seg.start,
                end=seg.end,
                original_text=seg.original_text,
                translated_text=trans_info.get("translated_text", seg.original_text),
                speaker_id=seg.speaker_id,
                voice_profile=trans_info.get("voice_profile", seg.voice_profile or "km-KH-PisethNeural"),
                emotion=trans_info.get("emotion", "ធម្មតា"),
                status="បកប្រែរួចរាល់",
                audio_url=seg.audio_url
            ))

        return {
            "success": True,
            "message": "ការបកប្រែអត្ថបទតាមរយៈ Gemini AI បានជោគជ័យ!",
            "segments": [s.model_dump() for s in updated_segments]
        }

    except Exception as e:
        error_str = str(e)
        print(f"[TRANSLATION FAILED]: {error_str}")
        if "API_KEY_INVALID" in error_str:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail=f"Gemini API Key មិនត្រឹមត្រូវទេ (Invalid API Key): {error_str}"
            )
        elif "PERMISSION_DENIED" in error_str or "403" in error_str:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail=f"Gemini API Key គ្មានសិទ្ធិ (Permission Denied): {error_str}"
            )
        elif "RESOURCE_EXHAUSTED" in error_str or "429" in error_str:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"អស់កូតាប្រើប្រាស់ API (Quota Exceeded): {error_str}"
            )
        elif "UNAVAILABLE" in error_str or "503" in error_str:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Gemini កំពុងមានការប្រើប្រាស់ច្រើន។ ប្រព័ន្ធបានសាកល្បងឡើងវិញ និងម៉ូដែលជំនួសរួចហើយ។ សូមរង់ចាំបន្តិច រួចសាកល្បងម្ដងទៀត។"
            )
        raise HTTPException(
            status_code=500,
            detail=f"កំហុសក្នុងការបកប្រែ (Translation Error): {error_str}"
        )


@app.post("/api/generate-voice")
async def generate_voice(request: GenerateVoiceRequest):
    """Generates localized Khmer TTS audio files concurrently with Character Presets & Auto Lip-Sync Fit."""
    if not request.segments:
        raise HTTPException(status_code=400, detail="មិនមាន Segment សម្រាប់បង្កើតសំឡេងទេ!")

    try:
        import edge_tts
    except ImportError:
        raise HTTPException(
            status_code=500,
            detail="កញ្ចប់ edge-tts មិនទាន់ត្រូវបានដំឡើងទេ។ សូមដំណើរការ pip install edge-tts"
        )

    sem = asyncio.Semaphore(10)

    async def generate_segment_voice(seg: SegmentItem):
        khmer_text = (seg.translated_text or seg.original_text or "").strip()
        if not khmer_text:
            return seg

        # Resolve voice preset
        preset = CHARACTER_PRESETS.get(seg.voice_profile, CHARACTER_PRESETS["km-KH-PisethNeural"])
        base_voice = preset["base"]

        # Combine preset pitch/rate with user global fine-tuning
        if "Piseth" in base_voice:
            user_r = request.male_rate or 0
            user_p = request.male_pitch or 0
        else:
            user_r = request.female_rate or 0
            user_p = request.female_pitch or 0

        final_r = preset["rate"] + user_r
        final_p = preset["pitch"] + user_p

        rate_str = f"{final_r:+d}%" if final_r != 0 else "+0%"
        pitch_str = f"{final_p:+d}Hz" if final_p != 0 else "+0Hz"

        filename = f"voice_seg_{seg.id}_{uuid.uuid4().hex[:6]}.mp3"
        output_path = AUDIO_SEGMENTS_DIR / filename

        async with sem:
            try:
                communicate = edge_tts.Communicate(khmer_text, base_voice, rate=rate_str, pitch=pitch_str)
                await communicate.save(str(output_path))

                # --- Auto Audio Time-Stretch / Lip-Sync Fit ---
                target_dur = max(0.4, float(seg.end - seg.start))
                actual_dur = await asyncio.to_thread(get_video_duration, output_path)

                if actual_dur > 0 and request.auto_fit and actual_dur > target_dur * 1.04:
                    speed_factor = min(1.38, actual_dur / target_dur)
                    if speed_factor > 1.04:
                        stretched_file = AUDIO_SEGMENTS_DIR / f"fit_{uuid.uuid4().hex[:6]}_{filename}"
                        ffmpeg_bin = get_ffmpeg_binary()
                        cmd = [
                            ffmpeg_bin, "-y",
                            "-i", str(output_path),
                            "-filter:a", f"atempo={speed_factor:.3f}",
                            "-q:a", "2",
                            str(stretched_file)
                        ]
                        await asyncio.to_thread(run_command_sync, cmd)
                        if stretched_file.exists() and stretched_file.stat().st_size > 0:
                            shutil.move(str(stretched_file), str(output_path))
                            seg.status = f"Fit ({speed_factor:.2f}x)"
                        else:
                            seg.status = "បង្កើតសំឡេងរួចរាល់"
                    else:
                        seg.status = "បង្កើតសំឡេងរួចរាល់"
                else:
                    seg.status = "បង្កើតសំឡេងរួចរាល់"

                seg.audio_url = f"/audio_segments/{filename}"
            except Exception as e:
                seg.status = f"បរាជ័យ: {str(e)[:30]}"
        return seg

    tasks = [generate_segment_voice(s) for s in request.segments]
    updated_segments = await asyncio.gather(*tasks)

    return {
        "success": True,
        "message": "ការបង្កើតសំឡេងនិយាយ (TTS) បានជោគជ័យ!",
        "segments": [s.model_dump() for s in updated_segments]
    }


@app.post("/api/remove-voice")
async def remove_voice(request: RemoveVoiceRequest):
    """Removes or mutes the original audio track from the video."""
    video_path = resolve_video_path(request.video_filename)
    if not video_path.exists():
        video_path = resolve_video_path(request.video_filename)
    if not video_path.exists():
        raise HTTPException(status_code=404, detail="រកមិនឃើញឯកសារវីដេអូដើមទេ!")

    # If the current source is already a muted output, return it unchanged.
    if video_path.parent == OUTPUTS_DIR and video_path.name.startswith("novocal_"):
        return {
            "success": True,
            "message": "វីដេអូនេះបានដកសំឡេងដើមរួចហើយ។",
            "filename": video_path.name,
            "video_url": f"/outputs/{quote(video_path.name, safe='')}"
        }

    output_filename = f"novocal_{video_path.name}"
    output_path = OUTPUTS_DIR / output_filename
    ffmpeg_bin = get_ffmpeg_binary()
    cmd = [ffmpeg_bin, "-y", "-i", str(video_path), "-map", "0:v:0", "-c:v", "copy", "-an", "-sn", "-dn", str(output_path)]

    try:
        await asyncio.to_thread(run_command_sync, cmd)
        return {
            "success": True,
            "message": "បានលុបសំឡេងដើមចេញពីវីដេអូរួចរាល់!",
            "filename": output_filename,
            "video_url": f"/outputs/{quote(output_filename, safe='')}"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"កំហុសក្នុងការលុបសំឡេង: {str(e)}")


@app.post("/api/separate-dialogue")
async def separate_dialogue_endpoint(request: RemoveVoiceRequest):
    """Use optional Demucs two-stem separation and save the accompaniment for export."""
    video_path = resolve_video_path(request.video_filename)
    work_dir = OUTPUTS_DIR / f"demucs_{uuid.uuid4().hex[:8]}"
    temp_wav = UPLOADS_DIR / f"temp_demucs_{uuid.uuid4().hex[:8]}.wav"
    saved_track = None
    try:
        work_dir.mkdir(parents=True, exist_ok=True)
        ffmpeg_bin = get_ffmpeg_binary()
        await asyncio.to_thread(run_command_sync, [
            ffmpeg_bin, "-y", "-i", str(video_path), "-vn", "-ac", "2", "-ar", "44100",
            "-c:a", "pcm_s16le", str(temp_wav)
        ])
        device = os.environ.get("AI_DUBBER_DEMUCS_DEVICE", "cpu").strip().lower()
        if device not in {"cpu", "cuda"}:
            device = "cpu"
        command = [
            sys.executable, "-m", "demucs", "--two-stems=vocals", "-n", "htdemucs",
            "--out", str(work_dir), "-d", device, str(temp_wav)
        ]
        await asyncio.to_thread(run_command_sync, command)
        candidates = list(work_dir.rglob("no_vocals.wav"))
        if not candidates:
            raise RuntimeError("Demucs completed without producing its no_vocals.wav accompaniment stem.")
        saved_track = AUDIO_SEGMENTS_DIR / f"background_{uuid.uuid4().hex[:10]}.wav"
        shutil.copy2(candidates[0], saved_track)
        return {
            "success": True,
            "background_audio_url": f"/audio_segments/{quote(saved_track.name, safe='')}",
            "filename": saved_track.name,
            "message": "Dialogue was separated; the background accompaniment is ready for video export."
        }
    except Exception as e:
        if saved_track:
            saved_track.unlink(missing_ok=True)
        message = str(e)
        if "No module named demucs" in message:
            message = "Dialogue separation is optional. Install backend/requirements-separation.txt, then restart the app."
        raise HTTPException(status_code=500, detail=f"Dialogue separation failed: {message}")
    finally:
        temp_wav.unlink(missing_ok=True)
        shutil.rmtree(work_dir, ignore_errors=True)


@app.post("/api/detect-speakers")
async def detect_speakers_endpoint(request: DetectSpeakersRequest):
    """Use optional pyannote identity diarization, with explicit pitch-only fallback."""
    video_path = resolve_video_path(request.video_filename)
    temp_wav = UPLOADS_DIR / f"temp_detect_{uuid.uuid4().hex[:6]}.wav"
    try:
        await asyncio.to_thread(extract_audio_from_video, video_path, temp_wav)
        mode = "pitch"
        warning = None
        diarization_turns = []
        try:
            pipeline = await asyncio.to_thread(get_diarization_pipeline)
            if pipeline is not None:
                diarization_result = await asyncio.to_thread(pipeline, str(temp_wav))
                annotation = getattr(diarization_result, "speaker_diarization", diarization_result)
                diarization_turns = [
                    (float(turn.start), float(turn.end), str(speaker))
                    for turn, _, speaker in annotation.itertracks(yield_label=True)
                ]
                mode = "diarization"
        except Exception as diarization_error:
            warning = f"Speaker diarization unavailable; used pitch suggestions instead. {diarization_error}"

        speaker_ids = {}
        with wave.open(str(temp_wav), "rb") as wf:
            sr = wf.getframerate()
            total_frames = wf.getnframes()
            for seg in request.segments:
                s_idx = max(0, int(seg.start * sr))
                e_idx = min(total_frames, int(seg.end * sr))
                if e_idx > s_idx:
                    wf.setpos(s_idx)
                    raw_segment = wf.readframes(e_idx - s_idx)
                    segment_audio = np.frombuffer(raw_segment, dtype=np.int16).astype(np.float32) / 32768.0
                    seg.voice_profile = detect_speaker_gender(segment_audio, sr=sr)
                if mode == "diarization":
                    best_speaker, best_overlap = None, 0.0
                    for turn_start, turn_end, raw_speaker in diarization_turns:
                        overlap = max(0.0, min(float(seg.end), turn_end) - max(float(seg.start), turn_start))
                        if overlap > best_overlap:
                            best_speaker, best_overlap = raw_speaker, overlap
                    if best_speaker is not None:
                        if best_speaker not in speaker_ids:
                            speaker_ids[best_speaker] = f"speaker_{len(speaker_ids) + 1}"
                        seg.speaker_id = speaker_ids[best_speaker]

        return {
            "success": True,
            "segments": [segment.model_dump() for segment in request.segments],
            "mode": mode,
            "speaker_count": len(speaker_ids),
            "warning": warning or ("Set AI_DUBBER_HF_TOKEN and install backend/requirements-diarization.txt to enable speaker identity detection." if mode == "pitch" else None),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Speaker analysis failed: {e}")
    finally:
        temp_wav.unlink(missing_ok=True)


@app.post("/api/auto-edit")
async def auto_edit_movie(request: AutoEditRequest):
    """Create vertical social clips from dialogue-dense parts of an uploaded video."""
    video_path = resolve_video_path(request.video_filename)
    if not video_path.exists():
        raise HTTPException(status_code=404, detail="Video file not found.")
    if request.clip_count < 1 or request.clip_count > 5:
        raise HTTPException(status_code=400, detail="Choose between 1 and 5 clips.")
    if request.target_seconds not in {15, 30, 45, 60, 90}:
        raise HTTPException(status_code=400, detail="Choose a clip length of 15, 30, 45, 60, or 90 seconds.")
    if not request.segments:
        raise HTTPException(status_code=400, detail="Transcribe the video before making automatic clips.")
    background_track_path = resolve_audio_segment_path(request.background_audio_url)
    if request.background_audio_url and not background_track_path:
        raise HTTPException(status_code=400, detail="The separated accompaniment track is missing or invalid.")

    video_duration = await asyncio.to_thread(get_video_duration, video_path)
    if video_duration <= 0:
        raise HTTPException(status_code=400, detail="Could not read the video duration.")

    clip_duration = min(float(request.target_seconds), video_duration)
    max_start = max(0.0, video_duration - clip_duration)
    stride = 3.0
    starts = [index * stride for index in range(int(max_start / stride) + 1)]
    if not starts or max_start - starts[-1] > 0.25:
        starts.append(max_start)

    transcript = []
    for segment in request.segments:
        try:
            start = max(0.0, float(segment.start))
            end = min(video_duration, float(segment.end))
        except (TypeError, ValueError):
            continue
        text = (segment.translated_text or segment.original_text or "").strip()
        if end <= start or not text:
            continue
        transcript.append({"start": start, "end": end, "text": text})
    transcript.sort(key=lambda item: item["start"])
    if not transcript:
        raise HTTPException(status_code=400, detail="No timed captions were found. Transcribe the video first.")

    candidates = []
    for start in starts:
        end = min(video_duration, start + clip_duration)
        covered_seconds = 0.0
        active_count = 0
        for item in transcript:
            if item["start"] >= end:
                break
            if item["end"] <= start:
                continue
            overlap = min(end, item["end"]) - max(start, item["start"])
            if overlap > 0:
                covered_seconds += overlap
                active_count += 1
        if active_count:
            speech_density = min(1.0, covered_seconds / max(clip_duration, 1.0))
            dialogue_turns = min(1.0, active_count / max(clip_duration / 3.0, 1.0))
            score = 0.7 * speech_density + 0.3 * dialogue_turns
            candidates.append({"start": start, "end": end, "score": score})

    if not candidates:
        raise HTTPException(status_code=400, detail="No dialogue was found in the transcript for clip selection.")

    selected = []
    for candidate in sorted(candidates, key=lambda item: item["score"], reverse=True):
        if all(candidate["end"] <= item["start"] or candidate["start"] >= item["end"] for item in selected):
            selected.append(candidate)
            if len(selected) >= request.clip_count:
                break
    selected.sort(key=lambda item: item["start"])

    def to_srt_time(seconds: float) -> str:
        total_ms = max(0, int(round(seconds * 1000)))
        hours = total_ms // 3_600_000
        minutes = (total_ms % 3_600_000) // 60_000
        whole_seconds = (total_ms % 60_000) // 1000
        milliseconds = total_ms % 1000
        return f"{hours:02d}:{minutes:02d}:{whole_seconds:02d},{milliseconds:03d}"

    generated_paths = []
    temporary_subtitles = []
    results = []
    try:
        for index, candidate in enumerate(selected, start=1):
            clip_start = candidate["start"]
            clip_end = candidate["end"]
            actual_duration = clip_end - clip_start
            token = uuid.uuid4().hex[:8]
            output_name = f"auto_reel_{index:02d}_{token}.mp4"
            output_path = OUTPUTS_DIR / output_name
            subtitle_path = None

            if request.burn_captions:
                subtitle_path = OUTPUTS_DIR / f"auto_reel_{token}.srt"
                temporary_subtitles.append(subtitle_path)
                subtitle_index = 1
                with open(subtitle_path, "w", encoding="utf-8-sig", newline="\n") as subtitle_file:
                    for item in transcript:
                        if item["start"] >= clip_end:
                            break
                        if item["end"] <= clip_start:
                            continue
                        relative_start = max(0.0, item["start"] - clip_start)
                        relative_end = min(actual_duration, item["end"] - clip_start)
                        if relative_end <= relative_start:
                            continue
                        caption = item["text"].replace("\r", " ").replace("\n", " ").replace("-->", "—>")
                        subtitle_file.write(
                            f"{subtitle_index}\n{to_srt_time(relative_start)} --> {to_srt_time(relative_end)}\n{caption}\n\n"
                        )
                        subtitle_index += 1
                if subtitle_index <= 1:
                    subtitle_path.unlink(missing_ok=True)
                    temporary_subtitles.remove(subtitle_path)
                    subtitle_path = None

            if request.blur_bottom_captions:
                filter_parts = [
                    "[0:v:0]split=2[base][caption]",
                    "[caption]crop=iw:ih/5:0:ih-ih/5,boxblur=20:10[captionblur]",
                    "[base][captionblur]overlay=0:H-h[clean]",
                    "[clean]split=2[bgsrc][fgsrc]",
                ]
            else:
                filter_parts = ["[0:v:0]split=2[bgsrc][fgsrc]"]
            filter_parts.extend([
                "[bgsrc]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=20:10[bg]",
                "[fgsrc]scale=1080:1920:force_original_aspect_ratio=decrease[fg]",
                "[bg][fg]overlay=(W-w)/2:(H-h)/2,setsar=1[reel]",
            ])
            video_map = "[reel]"
            if subtitle_path:
                style = "FontName=Kantumruy Pro,FontSize=42,PrimaryColour=&H00FFFFFF,BorderStyle=1,Outline=3,OutlineColour=&H00000000,Shadow=1,Alignment=2,MarginV=170"
                filter_parts.append(f"[reel]subtitles={subtitle_path.name}:force_style='{style}'[captioned]")
                video_map = "[captioned]"

            ffmpeg_cmd = [get_ffmpeg_binary(), "-y", "-nostdin", "-ss", f"{clip_start:.3f}", "-i", str(video_path)]
            if background_track_path:
                ffmpeg_cmd.extend(["-ss", f"{clip_start:.3f}", "-i", str(background_track_path)])
            ffmpeg_cmd.extend([
                "-t", f"{actual_duration:.3f}",
                "-filter_complex", ";".join(filter_parts),
                "-map", video_map,
                "-map", "1:a:0" if background_track_path else "0:a?",
                "-c:v", "libx264",
                "-preset", "veryfast",
                "-crf", "23",
                "-pix_fmt", "yuv420p",
                "-c:a", "aac",
                "-b:a", "128k",
                "-movflags", "+faststart",
                str(output_path),
            ])
            generated_paths.append(output_path)
            await asyncio.to_thread(run_command_sync, ffmpeg_cmd, OUTPUTS_DIR)
            results.append({
                "filename": output_name,
                "download_url": f"/outputs/{quote(output_name)}",
                "start_seconds": round(clip_start, 2),
                "duration_seconds": round(actual_duration, 2),
                "dialogue_score": round(candidate["score"], 3),
            })

        return {"success": True, "clips": results}
    except HTTPException:
        for path in generated_paths:
            path.unlink(missing_ok=True)
        raise
    except Exception as error:
        for path in generated_paths:
            path.unlink(missing_ok=True)
        raise HTTPException(status_code=500, detail=f"Auto edit failed: {str(error)[:800]}")
    finally:
        for path in temporary_subtitles:
            path.unlink(missing_ok=True)


@app.post("/api/export-video")
async def export_video(request: ExportVideoRequest):
    """Renders final dubbed video with FFmpeg and pydub master track assembly."""
    video_path = resolve_video_path(request.video_filename)
    if not video_path.exists():
        video_path = resolve_video_path(request.video_filename)
        if not video_path.exists():
            raise HTTPException(status_code=404, detail="រកមិនឃើញឯកសារវីដេអូដើមទេ!")

    background_track_path = resolve_audio_segment_path(request.background_audio_url)
    if request.background_audio_url and not background_track_path:
        raise HTTPException(status_code=400, detail="The separated background audio file is missing or invalid.")

    valid_segments = []
    for s in request.segments:
        if s.audio_url:
            local_audio_name = os.path.basename(s.audio_url)
            local_audio_path = AUDIO_SEGMENTS_DIR / local_audio_name
            if local_audio_path.exists():
                valid_segments.append((s, local_audio_path))

    if not valid_segments:
        raise HTTPException(
            status_code=400,
            detail="មិនទាន់មានសំឡេង TTS ត្រូវបានបង្កើតនៅឡើយទេ! សូមចុច 'បង្កើតសំឡេង' ជាមុនសិន។"
        )

    out_name = f"dubbed_{uuid.uuid4().hex[:6]}_{video_path.name}"
    final_output_path = OUTPUTS_DIR / out_name

    temp_master_wav = None
    temp_srt_path = None

    try:
        import pydub
        pydub_ffmpeg = get_ffmpeg_binary()
        pydub.AudioSegment.converter = pydub_ffmpeg
        pydub.AudioSegment.ffmpeg = pydub_ffmpeg

        temp_master_wav = OUTPUTS_DIR / f"temp_master_{uuid.uuid4().hex[:6]}.wav"

        def build_master_dub():
            duration = get_video_duration(video_path)
            if not duration or duration <= 0:
                duration = max(s.end for s, _ in valid_segments) + 2.0

            # Mix fixed-size windows and stream PCM directly to disk. Building a
            # movie-length AudioSegment requires large contiguous RAM allocations.
            sample_rate = 24000
            chunk_ms = 10000
            total_ms = int((duration + 5.0) * 1000)
            ordered = sorted(valid_segments, key=lambda pair: max(0.0, float(pair[0].start)))
            active_audio = []
            next_index = 0
            clip_decode_errors = []

            def decode_voice_clip(audio_file):
                # Pydub's MP3 loader invokes ffprobe for metadata. This app bundles
                # FFmpeg only, so decode to known PCM directly and avoid requiring
                # a separate ffprobe.exe installation.
                decode_cmd = [
                    pydub_ffmpeg,
                    "-hide_banner", "-loglevel", "error", "-nostdin",
                    "-i", str(audio_file),
                    "-map", "0:a:0", "-vn",
                    "-ac", "1", "-ar", str(sample_rate),
                    "-f", "s16le", "-acodec", "pcm_s16le", "pipe:1"
                ]
                decoded = subprocess.run(
                    decode_cmd,
                    stdin=subprocess.DEVNULL,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    check=False
                )
                if decoded.returncode != 0 or not decoded.stdout:
                    detail = decoded.stderr.decode("utf-8", errors="replace").strip()
                    raise RuntimeError(detail or "FFmpeg returned no decoded audio.")
                return pydub.AudioSegment(
                    data=decoded.stdout,
                    sample_width=2,
                    frame_rate=sample_rate,
                    channels=1
                )

            with wave.open(str(temp_master_wav), "wb") as output_wav:
                output_wav.setnchannels(1)
                output_wav.setsampwidth(2)
                output_wav.setframerate(sample_rate)

                for chunk_start in range(0, total_ms, chunk_ms):
                    chunk_end = min(total_ms, chunk_start + chunk_ms)
                    while next_index < len(ordered) and max(0, int(ordered[next_index][0].start * 1000)) < chunk_end:
                        seg, audio_file = ordered[next_index]
                        next_index += 1
                        try:
                            clip_start = max(0, int(seg.start * 1000))
                            clip = decode_voice_clip(audio_file)
                            active_audio.append((clip_start, clip))
                        except Exception as e:
                            clip_decode_errors.append((audio_file.name, str(e)))
                            print(f"Notice: Overlay audio error: {e}")

                    window = pydub.AudioSegment.silent(duration=chunk_end - chunk_start, frame_rate=sample_rate)
                    for clip_start, clip in active_audio:
                        clip_end = clip_start + len(clip)
                        overlap_start = max(chunk_start, clip_start)
                        overlap_end = min(chunk_end, clip_end)
                        if overlap_end <= overlap_start:
                            continue
                        clip_part = clip[overlap_start - clip_start:overlap_end - clip_start]
                        window = window.overlay(clip_part, position=overlap_start - chunk_start)

                    output_wav.writeframesraw(window.raw_data)
                    active_audio = [(start, clip) for start, clip in active_audio if start + len(clip) > chunk_end]

            if clip_decode_errors:
                examples = "; ".join(
                    f"{name}: {detail[:240]}" for name, detail in clip_decode_errors[:3]
                )
                raise RuntimeError(
                    f"Could not decode {len(clip_decode_errors)} of {len(valid_segments)} generated voice clips. {examples}"
                )

            return duration

        video_dur = await asyncio.to_thread(build_master_dub)

        ffmpeg_bin = get_ffmpeg_binary()
        ffmpeg_cmd = [
            ffmpeg_bin, "-y",
            "-i", str(video_path),
            "-i", str(temp_master_wav)
        ]
        if background_track_path:
            ffmpeg_cmd.extend(["-i", str(background_track_path)])

        is_mute = request.mute_original_audio or request.audio_mode == "mute"
        is_sidechain = (request.audio_mode == "sidechain" or (not is_mute and request.audio_mode != "duck_static"))
        has_source_audio = await asyncio.to_thread(video_has_audio_stream, video_path)
        background_input = 2 if background_track_path else 0
        has_background = bool(background_track_path) or has_source_audio

        # A silent source has no [0:a] input; export the generated dub by itself.
        if is_mute or not has_background:
            filter_complex = "[1:a]anull[final_audio]"
            audio_map = "[final_audio]"
        elif is_sidechain:
            filter_complex = (
                f"[{background_input}:a][1:a]sidechaincompress=threshold=0.08:ratio=4:attack=50:release=350:makeup=1[ducked_bg];"
                "[ducked_bg][1:a]amix=inputs=2:dropout_transition=0:normalize=0[final_audio]"
            )
            audio_map = "[final_audio]"
        else:
            bg_vol = max(0.0, min(1.0, request.background_volume))
            filter_complex = (
                f"[{background_input}:a]volume={bg_vol}[bg_ducked];"
                f"[bg_ducked][1:a]amix=inputs=2:dropout_transition=0:normalize=0[final_audio]"
            )
            audio_map = "[final_audio]"

        # Handle Subtitles Burn-in if enabled
        if request.burn_subtitles:
            temp_srt_path = OUTPUTS_DIR / f"temp_{uuid.uuid4().hex[:6]}.srt"
            with open(temp_srt_path, "w", encoding="utf-8") as srt_f:
                for s_idx, seg in enumerate(request.segments, start=1):
                    txt = (seg.translated_text or seg.original_text or "").strip()
                    if not txt:
                        continue
                    def to_srt_t(sec):
                        ms = int(round(max(0, sec) * 1000))
                        h = ms // 3600000
                        m = (ms % 3600000) // 60000
                        s = (ms % 60000) // 1000
                        rem = ms % 1000
                        return f"{h:02d}:{m:02d}:{s:02d},{rem:03d}"
                    srt_f.write(f"{s_idx}\n{to_srt_t(seg.start)} --> {to_srt_t(seg.end)}\n{txt}\n\n")

            # Keep the subtitle path relative: Windows drive letters and spaces
            # otherwise get parsed as subtitles-filter options by FFmpeg.
            subtitle_filename = temp_srt_path.name
            font_size = request.sub_font_size or 20
            color_map = {
                "white": "&H00FFFFFF",
                "yellow": "&H0000FFFF",
                "cyan": "&H00FFFF00"
            }
            primary_color = color_map.get(request.sub_color, "&H00FFFFFF")

            if request.sub_style == "box":
                style_attr = "BorderStyle=3,BackColour=&H80000000,OutlineColour=&H80000000,Outline=0"
            else:
                style_attr = "BorderStyle=1,Outline=2.5,OutlineColour=&H00000000"

            if request.sub_position == "top":
                pos_attr = "Alignment=6,MarginV=35"
            elif request.sub_position == "center":
                pos_attr = "Alignment=10,MarginV=0"
            else:
                pos_attr = "Alignment=2,MarginV=35"

            sub_filter = f"subtitles={subtitle_filename}:force_style='FontName=Kantumruy Pro,FontSize={font_size},PrimaryColour={primary_color},{style_attr},{pos_attr}'"

            ffmpeg_cmd.extend([
                "-nostdin",
                "-filter_complex", filter_complex,
                "-vf", sub_filter,
                "-map", "0:v:0",
                "-map", audio_map,
                "-c:v", "libx264",
                "-preset", "fast",
                "-crf", "22",
                "-c:a", "aac",
                "-b:a", "192k",
                "-shortest",
                str(final_output_path)
            ])
        else:
            ffmpeg_cmd.extend([
                "-nostdin",
                "-filter_complex", filter_complex,
                "-map", "0:v:0",
                "-map", audio_map,
                "-c:v", "copy",
                "-c:a", "aac",
                "-b:a", "192k",
                "-shortest",
                str(final_output_path)
            ])

        await asyncio.to_thread(
            run_command_sync,
            ffmpeg_cmd,
            OUTPUTS_DIR if request.burn_subtitles else None,
        )

        return {
            "success": True,
            "message": "ការនាំចេញវីដេអូបានសម្រេចដោយជោគជ័យ!",
            "output_filename": out_name,
            "download_url": f"/outputs/{quote(out_name)}"
        }

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"កំហុសក្នុងការនាំចេញវីដេអូ (Video Export Error): {str(e)}"
        )
    finally:
        if temp_master_wav and temp_master_wav.exists():
            try:
                temp_master_wav.unlink()
            except Exception:
                pass
        if temp_srt_path and temp_srt_path.exists():
            try:
                temp_srt_path.unlink()
            except Exception:
                pass


@app.post("/api/download-url")
async def download_video_url(request: DownloadUrlRequest):
    """Downloads video directly from URL (YouTube, Facebook, TikTok) using yt-dlp."""
    if not request.url or not request.url.strip():
        raise HTTPException(status_code=400, detail="សូមបញ្ចូល URL វីដេអូត្រឹមត្រូវមួយ!")

    try:
        import yt_dlp
    except ImportError:
        raise HTTPException(
            status_code=500,
            detail="កញ្ចប់ 'yt-dlp' មិនទាន់ត្រូវបានដំឡើងទេ។ សូមដំណើរការ 'pip install yt-dlp'!"
        )

    unique_id = uuid.uuid4().hex[:8]
    output_tmpl = str(UPLOADS_DIR / f"{unique_id}_%(id)s.%(ext)s")

    ffmpeg_bin = get_ffmpeg_binary()

    ydl_opts = {
        'format': 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/bestvideo+bestaudio/best[ext=mp4]/best',
        'outtmpl': output_tmpl,
        'quiet': True,
        'no_warnings': True,
        'merge_output_format': 'mp4',
        'ffmpeg_location': ffmpeg_bin,
        'max_filesize': MAX_UPLOAD_BYTES,
    }

    try:
        def do_download():
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(request.url.strip(), download=True)
                prepared = Path(ydl.prepare_filename(info))
                filename = prepared.name
                if not (UPLOADS_DIR / filename).exists():
                    mp4_candidate = prepared.stem + ".mp4"
                    if (UPLOADS_DIR / mp4_candidate).exists():
                        filename = mp4_candidate

                if not (UPLOADS_DIR / filename).exists():
                    candidates = list(UPLOADS_DIR.glob(f"{unique_id}_*"))
                    if candidates:
                        filename = candidates[0].name

                return filename, info

        loop = asyncio.get_event_loop()
        filename, info = await loop.run_in_executor(None, do_download)

        video_path = UPLOADS_DIR / filename
        duration = info.get('duration') or await asyncio.to_thread(get_video_duration, video_path)

        return {
            "success": True,
            "message": "បានទាញយកវីដេអូពី Link ដោយជោគជ័យ!",
            "filename": filename,
            "video_url": f"/uploads/{quote(filename, safe='')}",
            "duration": duration,
            "title": info.get('title', filename)
        }
    except Exception as e:
        host = (urlparse(request.url.strip()).hostname or "").lower()
        if host == "dramabox.com" or host.endswith(".dramabox.com"):
            error_text = str(e)
            if "403" in error_text or "Forbidden" in error_text:
                for partial_file in UPLOADS_DIR.glob(f"{unique_id}_*"):
                    try:
                        partial_file.unlink()
                    except OSError:
                        pass
                raise HTTPException(
                    status_code=403,
                    detail=(
                        "DramaBox បានបដិសេធសំណើទាញយកនេះ (HTTP 403)។ "
                        "AI DUBBER មិនអាចទាញយកវីដេអូដែលត្រូវបានការពារបានទេ។ "
                        "ប្រសិនបើ DramaBox ផ្ដល់ឯកសារវីដេអូដែលអាចទាញយកបានតាមជម្រើសផ្លូវការ "
                        "សូមទាញយកឯកសារនោះ រួចបង្ហោះវានៅទីនេះ។"
                    )
                ) from e
        raise HTTPException(
            status_code=500,
            detail=f"កំហុសក្នុងការទាញយកវីដេអូពី Link: {str(e)}"
        )


@app.post("/api/download-url-progress")
async def download_video_url_with_progress(request: DownloadUrlRequest):
    """Stream yt-dlp's byte progress while downloading a source video."""
    if not request.url or not request.url.strip():
        raise HTTPException(status_code=400, detail="Please enter a video URL.")

    try:
        import yt_dlp
    except ImportError:
        raise HTTPException(status_code=500, detail="yt-dlp is not installed.")

    unique_id = uuid.uuid4().hex[:8]
    output_tmpl = str(UPLOADS_DIR / f"{unique_id}_%(id)s.%(ext)s")
    ydl_opts = {
        "format": "bestvideo[ext=mp4]+bestaudio[ext=m4a]/bestvideo+bestaudio/best[ext=mp4]/best",
        "outtmpl": output_tmpl,
        "quiet": True,
        "no_warnings": True,
        "merge_output_format": "mp4",
        "ffmpeg_location": get_ffmpeg_binary(),
        "max_filesize": MAX_UPLOAD_BYTES,
    }

    loop = asyncio.get_running_loop()
    progress_events: asyncio.Queue = asyncio.Queue()
    tracked_files: Dict[str, Dict[str, int]] = {}
    last_percent = 0

    def publish(event: Dict[str, Any]):
        loop.call_soon_threadsafe(progress_events.put_nowait, event)

    def progress_hook(data: Dict[str, Any]):
        nonlocal last_percent
        status_value = data.get("status")
        if status_value not in {"downloading", "finished"}:
            return

        file_key = str(data.get("filename") or data.get("tmpfilename") or "video")
        downloaded = int(data.get("downloaded_bytes") or 0)
        total = int(data.get("total_bytes") or data.get("total_bytes_estimate") or 0)
        if status_value == "finished" and not total:
            total = downloaded
        tracked_files[file_key] = {"downloaded": downloaded, "total": total}

        known_files = [item for item in tracked_files.values() if item["total"] > 0]
        total_bytes = sum(item["total"] for item in known_files)
        downloaded_bytes = sum(min(item["downloaded"], item["total"]) for item in known_files)
        percent = None
        if total_bytes:
            percent = min(99, max(last_percent, round(downloaded_bytes * 100 / total_bytes)))
            last_percent = percent

        publish({
            "type": "progress",
            "status": status_value,
            "percent": percent,
            "downloaded_bytes": downloaded_bytes if total_bytes else downloaded,
            "total_bytes": total_bytes or total or None,
            "speed": data.get("speed"),
            "eta": data.get("eta"),
        })

    ydl_opts["progress_hooks"] = [progress_hook]
    source_host = (urlparse(request.url.strip()).hostname or "").lower()

    def download_worker():
        try:
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(request.url.strip(), download=True)
                prepared = Path(ydl.prepare_filename(info))
                filename = prepared.name
                if not (UPLOADS_DIR / filename).exists():
                    mp4_candidate = prepared.stem + ".mp4"
                    if (UPLOADS_DIR / mp4_candidate).exists():
                        filename = mp4_candidate
                if not (UPLOADS_DIR / filename).exists():
                    candidates = list(UPLOADS_DIR.glob(f"{unique_id}_*"))
                    if candidates:
                        filename = candidates[0].name

            video_path = UPLOADS_DIR / filename
            duration = info.get("duration") or get_video_duration(video_path)
            publish({
                "type": "complete",
                "data": {
                    "success": True,
                    "filename": filename,
                    "video_url": f"/uploads/{quote(filename, safe='')}",
                    "duration": duration,
                    "title": info.get("title", filename),
                },
            })
        except Exception as error:
            error_text = str(error)
            if (source_host == "dramabox.com" or source_host.endswith(".dramabox.com")) and (
                "403" in error_text or "Forbidden" in error_text
            ):
                for partial_file in UPLOADS_DIR.glob(f"{unique_id}_*"):
                    try:
                        partial_file.unlink()
                    except OSError:
                        pass
                error_text = (
                    "DramaBox returned HTTP 403. AI DUBBER cannot access this video from the current network. "
                    "If you have access, download the video through your browser and upload the file instead."
                )
            publish({"type": "error", "message": f"Video download failed: {error_text}"})

    loop.run_in_executor(None, download_worker)

    async def event_stream():
        yield f"data: {json.dumps({'type': 'progress', 'status': 'preparing', 'percent': 0})}\n\n"
        while True:
            event = await progress_events.get()
            yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"
            if event.get("type") in {"complete", "error"}:
                break

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


if __name__ == "__main__":
    import uvicorn
    print("=" * 60)
    print("  AI Video Dubber & Translation Running on http://127.0.0.1:8000")
    print("=" * 60)
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
