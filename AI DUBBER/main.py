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
import wave
import numpy as np
from pathlib import Path
from urllib.parse import quote
from typing import List, Optional

from fastapi import FastAPI, UploadFile, File, Form, Header, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from pydantic import BaseModel, Field

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

# Base directories
BASE_DIR = Path(__file__).resolve().parent
UPLOADS_DIR = BASE_DIR / "uploads"
OUTPUTS_DIR = BASE_DIR / "outputs"
AUDIO_SEGMENTS_DIR = BASE_DIR / "audio_segments"
STATIC_DIR = BASE_DIR / "static"

for folder in [UPLOADS_DIR, OUTPUTS_DIR, AUDIO_SEGMENTS_DIR, STATIC_DIR]:
    folder.mkdir(parents=True, exist_ok=True)

app = FastAPI(
    title="AI Video Dubber & Translation API",
    description="Backend for AI Video Transcription, Translation, and Dubbing in Khmer",
    version="1.0.0"
)

# CORS setup
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
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
    burn_subtitles: bool = False
    sub_font_size: Optional[int] = 20
    sub_color: Optional[str] = "white" # "white", "yellow", "cyan"
    sub_style: Optional[str] = "box" # "box" (Netflix transparent box), "outline" (Black stroke)
    sub_position: Optional[str] = "bottom" # "bottom", "top", "center" 

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


# --- Helper Functions & FFmpeg Detection ---

BIN_DIR = BASE_DIR / "bin"
BIN_DIR.mkdir(parents=True, exist_ok=True)

def setup_ffmpeg_environment():
    """Ensure ffmpeg executable exists in bin/ and PATH has bin/ directory."""
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


def run_command_sync(cmd: List[str]) -> subprocess.CompletedProcess:
    """Executes a system shell command safely with friendly error handling."""
    try:
        return subprocess.run(
            cmd,
            stdin=subprocess.DEVNULL,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
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

def get_whisper_instance():
    """Lazily load faster-whisper model with CUDA auto-detection."""
    global _whisper_model
    if _whisper_model is None:
        try:
            from faster_whisper import WhisperModel
            import torch
            has_cuda = torch.cuda.is_available()
            device = "cuda" if has_cuda else "cpu"
            compute_type = "float16" if has_cuda else "int8"
            _whisper_model = WhisperModel("base", device=device, compute_type=compute_type)
        except Exception:
            from faster_whisper import WhisperModel
            _whisper_model = WhisperModel("base", device="cpu", compute_type="int8")
    return _whisper_model


# --- API Routes ---

@app.get("/")
async def serve_index():
    """Serves the Khmer-language Single Page Application."""
    index_file = STATIC_DIR / "index.html"
    if not index_file.exists():
        raise HTTPException(status_code=404, detail="រកមិនឃើញឯកសារ index.html ទេ")
    return FileResponse(str(index_file))


@app.post("/api/upload")
async def upload_video(file: UploadFile = File(...)):
    """Uploads a video file and prepares it for processing."""
    file_id = str(uuid.uuid4())[:8]
    # Keep only the client filename, then remove characters invalid on Windows.
    original_name = Path(file.filename or "video").name.replace("\\", "_")
    original_name = re.sub(r'[<>:"/\\|?*\x00-\x1f]', "_", original_name).strip(" .")
    original_name = original_name[:180] or "video"
    sanitized_name = f"{file_id}_{original_name.replace(' ', '_')}"
    target_path = UPLOADS_DIR / sanitized_name

    def save_uploaded_file():
        with open(target_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer, length=1024 * 1024)

    await asyncio.to_thread(save_uploaded_file)
    duration = await asyncio.to_thread(get_video_duration, target_path)

    return {
        "success": True,
        "message": "បានផ្ទុកវីដេអូដោយជោគជ័យ!",
        "filename": sanitized_name,
        "video_url": f"/uploads/{quote(sanitized_name, safe='')}",
        "duration": duration
    }


@app.post("/api/transcribe-stream")
async def transcribe_stream(filename: str = Form(...), duration: float = Form(0.0)):
    """
    Real-time Server-Sent Events (SSE) streaming endpoint for transcription.
    Runs Whisper in a dedicated worker thread with an asyncio-compatible Queue.
    Pushes progress and segments instantly without pre-extracting WAV files.
    """
    import queue
    import threading

    video_path = UPLOADS_DIR / filename
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
                segments_gen, info = model.transcribe(
                    target_media,
                    beam_size=1,
                    vad_filter=False
                )

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
                seg_id = 1
                for seg in segments_gen:
                    text_cleaned = seg.text.strip()
                    if not text_cleaned:
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

                if segment_count == 0:
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
    video_path = UPLOADS_DIR / filename
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
                    contents="Hello"
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
    video_path = UPLOADS_DIR / request.video_filename
    if not video_path.exists():
        video_path = OUTPUTS_DIR / request.video_filename
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


@app.post("/api/detect-speakers")
async def detect_speakers_endpoint(request: DetectSpeakersRequest):
    """Analyzes acoustic pitch across all segments to auto-classify male vs female speakers."""
    video_path = UPLOADS_DIR / request.video_filename
    if not video_path.exists():
        video_path = OUTPUTS_DIR / request.video_filename
        if not video_path.exists():
            raise HTTPException(status_code=404, detail="រកមិនឃើញឯកសារវីដេអូដើមទេ!")

    temp_wav = UPLOADS_DIR / f"temp_detect_{uuid.uuid4().hex[:6]}.wav"
    try:
        await asyncio.to_thread(extract_audio_from_video, video_path, temp_wav)
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

        return {
            "success": True,
            "message": "បានវិភាគសំឡេង និងកំណត់តួអង្គប្រុស/ស្រីដោយជោគជ័យ!",
            "segments": [s.model_dump() for s in request.segments]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"កំហុសក្នុងការវិភាគសំឡេង: {str(e)}")
    finally:
        if temp_wav.exists():
            try:
                temp_wav.unlink()
            except Exception:
                pass


@app.post("/api/export-video")
async def export_video(request: ExportVideoRequest):
    """Renders final dubbed video with FFmpeg and pydub master track assembly."""
    video_path = UPLOADS_DIR / request.video_filename
    if not video_path.exists():
        video_path = OUTPUTS_DIR / request.video_filename
        if not video_path.exists():
            raise HTTPException(status_code=404, detail="រកមិនឃើញឯកសារវីដេអូដើមទេ!")

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

    out_name = f"dubbed_{uuid.uuid4().hex[:6]}_{request.video_filename}"
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
                            clip = pydub.AudioSegment.from_file(str(audio_file))
                            clip = clip.set_frame_rate(sample_rate).set_channels(1).set_sample_width(2)
                            active_audio.append((clip_start, clip))
                        except Exception as e:
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

            return duration

        video_dur = await asyncio.to_thread(build_master_dub)

        ffmpeg_bin = get_ffmpeg_binary()
        ffmpeg_cmd = [
            ffmpeg_bin, "-y",
            "-i", str(video_path),
            "-i", str(temp_master_wav)
        ]

        is_mute = request.mute_original_audio or request.audio_mode == "mute"
        is_sidechain = (request.audio_mode == "sidechain" or (not is_mute and request.audio_mode != "duck_static"))
        has_source_audio = await asyncio.to_thread(video_has_audio_stream, video_path)

        # A silent source has no [0:a] input; export the generated dub by itself.
        if is_mute or not has_source_audio:
            filter_complex = "[1:a]anull[final_audio]"
            audio_map = "[final_audio]"
        elif is_sidechain:
            filter_complex = (
                "[0:a][1:a]sidechaincompress=threshold=0.08:ratio=4:attack=50:release=350:makeup=1[ducked_bg];"
                "[ducked_bg][1:a]amix=inputs=2:dropout_transition=0:normalize=0[final_audio]"
            )
            audio_map = "[final_audio]"
        else:
            bg_vol = max(0.0, min(1.0, request.background_volume))
            filter_complex = (
                f"[0:a]volume={bg_vol}[bg_ducked];"
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

            escaped_srt = str(temp_srt_path).replace("\\", "/").replace(":", "\\:").replace(" ", "\\ ")
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

            sub_filter = f"subtitles={escaped_srt}:force_style='FontName=Kantumruy Pro,FontSize={font_size},PrimaryColour={primary_color},{style_attr},{pos_attr}'"

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

        await asyncio.to_thread(run_command_sync, ffmpeg_cmd)

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
    output_tmpl = str(UPLOADS_DIR / f"{unique_id}_%(title)s.%(ext)s")

    ffmpeg_bin = get_ffmpeg_binary()

    ydl_opts = {
        'format': 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/bestvideo+bestaudio/best[ext=mp4]/best',
        'outtmpl': output_tmpl,
        'quiet': True,
        'no_warnings': True,
        'merge_output_format': 'mp4',
        'ffmpeg_location': ffmpeg_bin
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
        raise HTTPException(
            status_code=500,
            detail=f"កំហុសក្នុងការទាញយកវីដេអូពី Link: {str(e)}"
        )


if __name__ == "__main__":
    import uvicorn
    print("=" * 60)
    print("  AI Video Dubber & Translation Running on http://127.0.0.1:8000")
    print("=" * 60)
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
