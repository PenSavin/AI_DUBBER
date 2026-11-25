"""Local YouTube Shorts and Facebook Page Reels publishing integrations."""

from __future__ import annotations

import asyncio
import html
import json
import mimetypes
import os
import re
import secrets
import subprocess
import sys
import threading
import time
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Literal, Optional
from urllib.parse import urlencode

from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import HTMLResponse
from pydantic import BaseModel, Field


BACKEND_ROOT = Path(__file__).resolve().parent
IS_FROZEN = getattr(sys, "frozen", False)
APP_ROOT = Path(sys.executable).resolve().parent if IS_FROZEN else BACKEND_ROOT.parent
DATA_DIR = Path(os.environ.get("AI_DUBBER_DATA_DIR", str(APP_ROOT))).expanduser().resolve()
UPLOADS_DIR = DATA_DIR / "uploads"
OUTPUTS_DIR = DATA_DIR / "outputs"
PUBLISHER_DIR = DATA_DIR / "publisher_data"
PUBLISHER_DIR.mkdir(parents=True, exist_ok=True)

GOOGLE_CLIENT_FILE = PUBLISHER_DIR / "youtube-client.json"
GOOGLE_TOKEN_FILE = PUBLISHER_DIR / "youtube-token.json"
GOOGLE_SCOPES = ["https://www.googleapis.com/auth/youtube.upload"]
META_CONFIG_FILE = PUBLISHER_DIR / "meta-config.json"
META_PAGES_FILE = PUBLISHER_DIR / "meta-pages.json"
META_GRAPH_VERSION = os.environ.get("AI_DUBBER_META_GRAPH_VERSION", "v27.0")
META_CALLBACK_URI = "http://127.0.0.1:8000/api/publisher/meta/callback"

router = APIRouter(prefix="/api/publisher", tags=["Publishing"])

_google_lock = threading.Lock()
_google_connect_state = {"state": "idle", "message": ""}
_meta_oauth_lock = threading.Lock()
_meta_oauth_pending: dict[str, float] = {}


class MetaConfigRequest(BaseModel):
    app_id: str = Field(min_length=1, max_length=200)
    app_secret: str = Field(min_length=1, max_length=500)


class PageSelectionRequest(BaseModel):
    page_id: str = Field(min_length=1, max_length=200)


class PublishRequest(BaseModel):
    video_filename: str = Field(min_length=1, max_length=255)
    platforms: list[Literal["youtube", "facebook"]] = Field(min_length=1)
    title: str = Field(min_length=1, max_length=100)
    description: str = Field(default="", max_length=5000)
    tags: str = Field(default="", max_length=1000)
    scheduled_at: Optional[datetime] = None
    youtube_privacy: Literal["public", "unlisted", "private"] = "public"
    ai_disclosure: bool = True
    rights_confirmed: bool = False


def _read_json(path: Path, fallback):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return fallback


def _write_json(path: Path, data) -> None:
    temp_path = path.with_suffix(path.suffix + ".tmp")
    temp_path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    temp_path.replace(path)


def _meta_config() -> dict:
    saved = _read_json(META_CONFIG_FILE, {})
    return {
        "app_id": os.environ.get("AI_DUBBER_META_APP_ID", saved.get("app_id", "")).strip(),
        "app_secret": os.environ.get("AI_DUBBER_META_APP_SECRET", saved.get("app_secret", "")).strip(),
    }


def _meta_pages() -> dict:
    data = _read_json(META_PAGES_FILE, {})
    if not isinstance(data, dict):
        return {"pages": [], "selected_page_id": ""}
    data.setdefault("pages", [])
    data.setdefault("selected_page_id", "")
    return data


def _youtube_connected() -> bool:
    return GOOGLE_TOKEN_FILE.is_file() and GOOGLE_CLIENT_FILE.is_file()


def _safe_error(error: Exception) -> str:
    return str(error).replace("\x1b", "")[:1200]


def _json_response(response):
    try:
        payload = response.json()
    except Exception:
        response.raise_for_status()
        raise RuntimeError("The publishing service returned an unreadable response.")
    if not response.ok or (isinstance(payload, dict) and payload.get("error")):
        error = payload.get("error", {}) if isinstance(payload, dict) else {}
        message = error.get("message") if isinstance(error, dict) else str(error)
        raise RuntimeError(message or f"Publishing service returned HTTP {response.status_code}.")
    return payload


def _video_output_path(filename: str) -> Path:
    if not isinstance(filename, str) or not filename.strip() or Path(filename).name != filename:
        raise HTTPException(status_code=400, detail="Choose a finished video from the output list.")
    candidate = (OUTPUTS_DIR / filename).resolve()
    try:
        candidate.relative_to(OUTPUTS_DIR.resolve())
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid video filename.")
    if not candidate.is_file() or candidate.suffix.lower() not in {
        ".mp4", ".m4v", ".mov", ".mkv", ".webm", ".avi", ".wmv", ".mpg", ".mpeg", ".3gp"
    }:
        raise HTTPException(status_code=404, detail="The finished video is no longer available.")
    return candidate


def _probe_video(path: Path) -> tuple[int, int, float]:
    bin_dir = APP_ROOT / "bin" if IS_FROZEN else BACKEND_ROOT / "bin"
    ffmpeg = bin_dir / ("ffmpeg.exe" if os.name == "nt" else "ffmpeg")
    if not ffmpeg.is_file():
        from shutil import which
        ffmpeg_path = which("ffmpeg")
        if not ffmpeg_path:
            raise RuntimeError("FFmpeg is required to inspect the video before posting.")
        ffmpeg = Path(ffmpeg_path)
    result = subprocess.run(
        [str(ffmpeg), "-hide_banner", "-i", str(path)],
        stdin=subprocess.DEVNULL,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        encoding="utf-8",
        errors="replace",
        check=False,
    )
    output = result.stderr
    video_line = next((line for line in output.splitlines() if "Video:" in line), "")
    dimensions = re.search(r"\b(\d{2,5})x(\d{2,5})\b", video_line)
    duration_match = re.search(r"Duration:\s*(\d+):(\d+):([\d.]+)", output)
    if not dimensions or not duration_match:
        raise RuntimeError("Could not read the video size and duration.")
    width, height = int(dimensions.group(1)), int(dimensions.group(2))
    duration = int(duration_match.group(1)) * 3600 + int(duration_match.group(2)) * 60 + float(duration_match.group(3))
    return width, height, duration


def _validate_facebook_reel(path: Path) -> None:
    width, height, duration = _probe_video(path)
    ratio = width / height if height else 0
    if width < 540 or height < 960 or abs(ratio - (9 / 16)) > 0.01:
        raise RuntimeError(
            f"Facebook Reels need a vertical 9:16 video at least 540×960. This file is {width}×{height}."
        )
    if duration < 3 or duration > 90:
        raise RuntimeError(f"Facebook Reels must be 3–90 seconds long. This file is {duration:.1f} seconds.")


def _youtube_credentials():
    if not GOOGLE_CLIENT_FILE.is_file():
        raise RuntimeError("Add a Google OAuth Desktop client JSON file in the publishing panel first.")
    if not GOOGLE_TOKEN_FILE.is_file():
        raise RuntimeError("Connect the YouTube account in the publishing panel first.")
    try:
        from google.auth.transport.requests import Request
        from google.oauth2.credentials import Credentials
    except ImportError as error:
        raise RuntimeError("YouTube support is not installed yet. Run setup.bat to install the new dependencies.") from error

    credentials = Credentials.from_authorized_user_file(str(GOOGLE_TOKEN_FILE), GOOGLE_SCOPES)
    if credentials.expired and credentials.refresh_token:
        credentials.refresh(Request())
        _write_json(GOOGLE_TOKEN_FILE, json.loads(credentials.to_json()))
    if not credentials.valid:
        raise RuntimeError("The YouTube connection expired. Connect the account again.")
    return credentials


def _publish_youtube(request: PublishRequest, path: Path) -> dict:
    try:
        from googleapiclient.discovery import build
        from googleapiclient.errors import HttpError
        from googleapiclient.http import MediaFileUpload
    except ImportError as error:
        raise RuntimeError("YouTube support is not installed yet. Run setup.bat to install the new dependencies.") from error

    credentials = _youtube_credentials()
    youtube = build("youtube", "v3", credentials=credentials, cache_discovery=False)
    scheduled = request.scheduled_at is not None
    status = {
        "privacyStatus": "private" if scheduled else request.youtube_privacy,
        "containsSyntheticMedia": request.ai_disclosure,
    }
    if scheduled:
        publish_at = request.scheduled_at.astimezone(timezone.utc)
        status["publishAt"] = publish_at.isoformat(timespec="seconds").replace("+00:00", "Z")

    tags = [tag.strip() for tag in request.tags.split(",") if tag.strip()][:500]
    body = {
        "snippet": {
            "title": request.title.strip(),
            "description": request.description.strip(),
            "tags": tags,
            "categoryId": "22",
        },
        "status": status,
    }
    media = MediaFileUpload(
        str(path),
        mimetype=mimetypes.guess_type(path.name)[0] or "video/mp4",
        chunksize=8 * 1024 * 1024,
        resumable=True,
    )
    upload = youtube.videos().insert(part="snippet,status", body=body, media_body=media)
    response = None
    try:
        while response is None:
            _, response = upload.next_chunk()
    except HttpError as error:
        raise RuntimeError(f"YouTube API error: {error}") from error
    video_id = response.get("id")
    return {
        "ok": True,
        "status": "scheduled" if scheduled else "uploaded",
        "video_id": video_id,
        "url": f"https://youtu.be/{video_id}" if video_id else None,
    }


def _publish_facebook(request: PublishRequest, path: Path) -> dict:
    try:
        import requests
    except ImportError as error:
        raise RuntimeError("Facebook support is not installed yet. Run setup.bat to install the new dependencies.") from error

    page_data = _meta_pages()
    page_id = page_data.get("selected_page_id", "")
    page = next((item for item in page_data.get("pages", []) if item.get("id") == page_id), None)
    if not page or not page.get("access_token"):
        raise RuntimeError("Connect Facebook and select a Page in the publishing panel first.")
    _validate_facebook_reel(path)

    access_token = page["access_token"]
    api_base = f"https://graph.facebook.com/{META_GRAPH_VERSION}"
    start = _json_response(requests.post(
        f"{api_base}/{page_id}/video_reels",
        data={"upload_phase": "start", "access_token": access_token},
        timeout=60,
    ))
    video_id = str(start.get("video_id", ""))
    upload_url = start.get("upload_url") or f"https://rupload.facebook.com/video-upload/{META_GRAPH_VERSION}/{video_id}"
    if not video_id:
        raise RuntimeError("Facebook did not return an upload session ID.")

    file_size = path.stat().st_size
    with path.open("rb") as video_file:
        transfer_response = requests.post(
            upload_url,
            data=video_file,
            headers={
                "Authorization": f"OAuth {access_token}",
                "offset": "0",
                "file_size": str(file_size),
                "Content-Type": "application/octet-stream",
            },
            timeout=(60, 900),
        )
    _json_response(transfer_response)

    scheduled = request.scheduled_at is not None
    finish_data = {
        "access_token": access_token,
        "video_id": video_id,
        "upload_phase": "finish",
        "video_state": "SCHEDULED" if scheduled else "PUBLISHED",
        "title": request.title.strip(),
        "description": request.description.strip(),
        "is_ai_generated": "true" if request.ai_disclosure else "false",
    }
    if scheduled:
        finish_data["scheduled_publish_time"] = str(int(request.scheduled_at.timestamp()))
    finish = _json_response(requests.post(f"{api_base}/{page_id}/video_reels", data=finish_data, timeout=60))
    if finish.get("success") is False:
        raise RuntimeError(finish.get("message") or "Facebook did not accept the Reel for publishing.")
    return {"ok": True, "status": "scheduled" if scheduled else "uploaded", "video_id": video_id}


@router.get("/videos")
async def list_finished_videos():
    videos = []
    allowed = {".mp4", ".m4v", ".mov", ".mkv", ".webm", ".avi", ".wmv", ".mpg", ".mpeg", ".3gp"}
    for path in OUTPUTS_DIR.iterdir():
        if path.is_file() and path.suffix.lower() in allowed:
            try:
                videos.append({"filename": path.name, "size": path.stat().st_size, "modified": path.stat().st_mtime})
            except OSError:
                continue
    videos.sort(key=lambda item: item["modified"], reverse=True)
    return {"videos": videos[:100]}


@router.get("/status")
async def publishing_status():
    config = _meta_config()
    pages_data = _meta_pages()
    return {
        "youtube": {
            "client_configured": GOOGLE_CLIENT_FILE.is_file(),
            "connected": _youtube_connected(),
            "connection": dict(_google_connect_state),
        },
        "facebook": {
            "configured": bool(config["app_id"] and config["app_secret"]),
            "app_id": config["app_id"],
            "callback_uri": META_CALLBACK_URI,
            "pages": [
                {"id": page.get("id"), "name": page.get("name"), "selected": page.get("id") == pages_data.get("selected_page_id")}
                for page in pages_data.get("pages", [])
            ],
            "selected_page_id": pages_data.get("selected_page_id", ""),
        },
    }


@router.post("/youtube/credentials")
async def upload_youtube_credentials(file: UploadFile = File(...)):
    content = await file.read(1024 * 1024 + 1)
    if len(content) > 1024 * 1024:
        raise HTTPException(status_code=413, detail="The Google OAuth JSON file is too large.")
    try:
        data = json.loads(content.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        raise HTTPException(status_code=400, detail="Choose a valid Google OAuth client JSON file.")
    client = data.get("installed") if isinstance(data, dict) else None
    if not isinstance(client, dict) or not client.get("client_id") or not client.get("client_secret"):
        raise HTTPException(status_code=400, detail="This must be a Google OAuth Desktop client JSON file.")
    _write_json(GOOGLE_CLIENT_FILE, data)
    return {"success": True, "client_configured": True}


def _run_google_oauth() -> None:
    try:
        from google_auth_oauthlib.flow import InstalledAppFlow
        client_config = _read_json(GOOGLE_CLIENT_FILE, None)
        if not client_config:
            raise RuntimeError("Add the Google OAuth client JSON file first.")
        flow = InstalledAppFlow.from_client_config(client_config, GOOGLE_SCOPES)
        credentials = flow.run_local_server(
            host="127.0.0.1",
            port=0,
            open_browser=True,
            success_message="YouTube is connected. You can close this browser tab and return to AI DUBBER.",
        )
        _write_json(GOOGLE_TOKEN_FILE, json.loads(credentials.to_json()))
        _google_connect_state.update({"state": "connected", "message": "YouTube account connected."})
    except Exception as error:
        _google_connect_state.update({"state": "error", "message": _safe_error(error)})


@router.post("/youtube/connect")
async def connect_youtube():
    if not GOOGLE_CLIENT_FILE.is_file():
        raise HTTPException(status_code=400, detail="Upload your Google OAuth Desktop client JSON first.")
    with _google_lock:
        if _google_connect_state.get("state") == "pending":
            return {"state": "pending", "message": "Finish the Google sign-in window."}
        _google_connect_state.update({"state": "pending", "message": "A Google sign-in window is opening."})
        threading.Thread(target=_run_google_oauth, daemon=True, name="youtube-oauth").start()
    return {"state": "pending", "message": "A Google sign-in window is opening."}


@router.post("/youtube/disconnect")
async def disconnect_youtube():
    GOOGLE_TOKEN_FILE.unlink(missing_ok=True)
    _google_connect_state.update({"state": "idle", "message": ""})
    return {"success": True}


@router.put("/facebook/config")
async def save_facebook_config(request: MetaConfigRequest):
    _write_json(META_CONFIG_FILE, {"app_id": request.app_id.strip(), "app_secret": request.app_secret.strip()})
    return {"success": True, "app_id": request.app_id.strip()}


@router.post("/facebook/connect")
async def connect_facebook():
    config = _meta_config()
    if not config["app_id"] or not config["app_secret"]:
        raise HTTPException(status_code=400, detail="Save your Meta App ID and App Secret first.")
    state = secrets.token_urlsafe(32)
    with _meta_oauth_lock:
        now = time.time()
        for expired_state, created in list(_meta_oauth_pending.items()):
            if now - created > 600:
                _meta_oauth_pending.pop(expired_state, None)
        _meta_oauth_pending[state] = now
    query = urlencode({
        "client_id": config["app_id"],
        "redirect_uri": META_CALLBACK_URI,
        "state": state,
        "response_type": "code",
        "scope": "pages_show_list,pages_read_engagement,pages_manage_posts",
    })
    return {"url": f"https://www.facebook.com/{META_GRAPH_VERSION}/dialog/oauth?{query}"}


def _meta_callback_page(message: str, success: bool) -> HTMLResponse:
    safe_message = html.escape(message)
    color = "#86efac" if success else "#fca5a5"
    return HTMLResponse(
        f"<!doctype html><html><meta charset='utf-8'><title>AI DUBBER Facebook connection</title>"
        f"<body style='font:16px sans-serif;background:#121215;color:#f4f4f5;padding:40px'>"
        f"<h2 style='color:{color}'>{safe_message}</h2><p>You can close this tab and return to AI DUBBER.</p></body></html>"
    )


@router.get("/facebook/callback", response_class=HTMLResponse)
async def facebook_oauth_callback(code: Optional[str] = None, state: Optional[str] = None, error: Optional[str] = None):
    if error:
        return _meta_callback_page("Facebook authorization was cancelled.", False)
    with _meta_oauth_lock:
        created = _meta_oauth_pending.pop(state or "", None)
    if not state or not created or time.time() - created > 600:
        return _meta_callback_page("Facebook connection expired. Start the connection again in AI DUBBER.", False)
    if not code:
        return _meta_callback_page("Facebook did not return an authorization code.", False)

    try:
        import requests
        config = _meta_config()
        token_data = _json_response(requests.get(
            f"https://graph.facebook.com/{META_GRAPH_VERSION}/oauth/access_token",
            params={
                "client_id": config["app_id"],
                "client_secret": config["app_secret"],
                "redirect_uri": META_CALLBACK_URI,
                "code": code,
            },
            timeout=30,
        ))
        short_token = token_data["access_token"]
        long_token_data = _json_response(requests.get(
            f"https://graph.facebook.com/{META_GRAPH_VERSION}/oauth/access_token",
            params={
                "grant_type": "fb_exchange_token",
                "client_id": config["app_id"],
                "client_secret": config["app_secret"],
                "fb_exchange_token": short_token,
            },
            timeout=30,
        ))
        user_token = long_token_data.get("access_token", short_token)
        pages_data = _json_response(requests.get(
            f"https://graph.facebook.com/{META_GRAPH_VERSION}/me/accounts",
            params={"fields": "id,name,access_token", "access_token": user_token},
            timeout=30,
        ))
        pages = [
            {"id": str(page["id"]), "name": str(page.get("name", "Facebook Page")), "access_token": page["access_token"]}
            for page in pages_data.get("data", [])
            if page.get("id") and page.get("access_token")
        ]
        if not pages:
            raise RuntimeError("No Facebook Pages were returned. Confirm your account has the Page content task and reconnect.")
        previous = _meta_pages()
        selected = previous.get("selected_page_id")
        if not any(page["id"] == selected for page in pages):
            selected = pages[0]["id"]
        _write_json(META_PAGES_FILE, {"pages": pages, "selected_page_id": selected})
        return _meta_callback_page("Facebook connected successfully.", True)
    except Exception as exception:
        return _meta_callback_page(f"Could not connect Facebook: {_safe_error(exception)}", False)


@router.put("/facebook/page")
async def select_facebook_page(request: PageSelectionRequest):
    pages_data = _meta_pages()
    if not any(page.get("id") == request.page_id for page in pages_data.get("pages", [])):
        raise HTTPException(status_code=404, detail="That Facebook Page is not connected.")
    pages_data["selected_page_id"] = request.page_id
    _write_json(META_PAGES_FILE, pages_data)
    return {"success": True, "selected_page_id": request.page_id}


@router.post("/facebook/disconnect")
async def disconnect_facebook():
    META_PAGES_FILE.unlink(missing_ok=True)
    return {"success": True}


@router.post("/publish")
async def publish_video(request: PublishRequest):
    if not request.rights_confirmed:
        raise HTTPException(status_code=400, detail="Confirm that you have the rights to publish this video.")
    path = _video_output_path(request.video_filename)
    now = datetime.now(timezone.utc)
    if request.scheduled_at:
        scheduled = request.scheduled_at
        if scheduled.tzinfo is None:
            scheduled = scheduled.replace(tzinfo=timezone.utc)
        request.scheduled_at = scheduled.astimezone(timezone.utc)
        if request.scheduled_at <= now + timedelta(minutes=5):
            raise HTTPException(status_code=400, detail="Choose a schedule time at least 5 minutes in the future.")
        if "facebook" in request.platforms and request.scheduled_at > now + timedelta(days=29):
            raise HTTPException(status_code=400, detail="Facebook Reels can be scheduled up to 29 days ahead.")
        if "facebook" in request.platforms and request.scheduled_at < now + timedelta(minutes=10):
            raise HTTPException(status_code=400, detail="Facebook Reels must be scheduled at least 10 minutes ahead.")

    results = {}
    for platform in dict.fromkeys(request.platforms):
        try:
            if platform == "youtube":
                results[platform] = await asyncio.to_thread(_publish_youtube, request, path)
            else:
                results[platform] = await asyncio.to_thread(_publish_facebook, request, path)
        except Exception as error:
            results[platform] = {"ok": False, "error": _safe_error(error)}
    return {"results": results}
