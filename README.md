<<<<<<< HEAD
# AI Movie Translator and Dubber

A local-first Windows app for translating video dialogue, reviewing the translation, generating dubbed speech, and exporting a finished video. The backend uses FastAPI, faster-whisper, Gemini, edge-tts, and FFmpeg. The Angular source is in `frontend/`; its compiled interface and fallback are served from `backend/static/`.

## Quick start on Windows

1. Install Python 3.10 or newer. Node.js/npm is optional when using the bundled interface; install it if you want to rebuild the Angular UI.
2. Run `setup.bat` once. It creates `.venv`, installs `backend/requirements.txt`, and builds the UI when npm is available.
3. Run `run.bat` and open `http://127.0.0.1:8000`.
4. Add a Gemini API key in Settings to translate dialogue. The key is kept in the browser or embedded webview's local storage and sent to the local backend only when testing the key or translating.

## Run it as a Windows app

To build the desktop app, first run `setup.bat`, then run `build_exe.bat`. The finished app is `dist\AI DUBBER\AI DUBBER.exe`. Copy the entire `dist\AI DUBBER` folder to a writable location on the PC and double-click the EXE. It starts the local service and displays the interface in its own desktop window without opening a separate browser. The window uses the Microsoft Edge WebView2 Runtime, which is included with Windows 11 and available for most Windows 10 PCs. Connecting YouTube still opens a browser for Google sign-in.

The executable folder includes the bundled interface and FFmpeg. Uploaded videos, generated audio, exports, publishing credentials, and logs are stored under `%LOCALAPPDATA%\AI DUBBER`. The first transcription downloads the selected Whisper model, and translation and voice generation still need internet access as described below.

Pyannote speaker diarization and Demucs dialogue separation remain optional Python-only add-ons and are not included in the packaged executable.

The local health check is available at `http://127.0.0.1:8000/api/health`; interactive API documentation is at `/docs`.

Transcription and FFmpeg rendering run on this computer. Whisper model weights are downloaded the first time a selected model is used. Translation sends transcript text to Gemini, and voice generation uses the online Edge TTS service, so those steps require internet access. The source video itself is not sent to Gemini by the translation workflow.

## Workflow

1. Upload a video or download one from a supported URL.
2. Transcribe dialogue, translate it, then review and edit segment text and timing.
3. Assign speaker profiles and voices, generate speech, and check timing.
4. Review subtitle timing and reading-speed warnings, then download SRT/WebVTT or export a dubbed MP4.
5. Save a lightweight `.dubproj`, or export a portable `.dubpack` with the video and generated audio clips.

The workspace also includes autosave and recovery, resumable transcription from the last saved caption, speaker voice profiles, glossary-aware translation, find/replace, timeline editing, audio mixing choices, and subtitle export checks for reading speed and caption length.

Use **Auto make Reels** after transcription to export up to five dialogue-dense moments as separate vertical 9:16 MP4 clips. The editor uses caption timing and dialogue density to select moments, adds translated captions when available (otherwise the original transcript), and fills the vertical frame with a blurred background. Optional Demucs separation can reduce dialogue while retaining accompaniment such as music and effects; results may contain artifacts. Another option blurs the bottom 20% of the source frame to cover burned-in captions. Moment selection does not evaluate story meaning or identify faces. Use videos you own or have permission to edit and share.

## Publish YouTube Shorts and Facebook Reels

The **Schedule YouTube Shorts / Facebook Reels** panel can upload a finished video from `outputs/` to YouTube and a Facebook Page. It supports publishing now or scheduling through the platform APIs, so the local app does not need to stay open after the platforms accept a scheduled post. YouTube calls these Shorts; square or vertical uploads up to three minutes are categorized as Shorts by YouTube. Facebook Reels require a vertical 9:16 video, at least 540×960, between 3 and 90 seconds.

Run `setup.bat` again after updating so the YouTube and Facebook API libraries are installed. Then restart the app.

### Connect YouTube

1. In Google Cloud Console, create a project, enable **YouTube Data API v3**, and create an **OAuth Client ID** with application type **Desktop app**.
2. In the publishing panel, choose the downloaded Google OAuth client JSON file, then select **Connect YouTube** and approve access in the browser.
3. Select a finished video, add its title and description, choose public/unlisted/private for immediate uploads, or set a future time to schedule it.

### Connect a Facebook Page

1. Create a Meta developer app with Facebook Login enabled.
2. Add the callback URL shown in the publishing panel to the app's Valid OAuth Redirect URIs.
3. Request `pages_show_list`, `pages_read_engagement`, and `pages_manage_posts`. The Facebook account must have the Page's `CREATE_CONTENT` task. Meta may require App Review before an app can publish to Pages outside its developer/test roles.
4. Enter the Meta App ID and App Secret, save them, connect Facebook, and choose the Page.

Publishing requires a confirmation that you have rights to post the selected video. The AI disclosure checkbox is on by default because this app generates dubbed speech. OAuth client details and tokens stay in the local, Git-ignored `publisher_data/` folder. Do not share that folder.

By default, automatic voice suggestions estimate pitch and do not identify recurring people. Optional pyannote diarization can label recurring speakers; optional Demucs separation can create an accompaniment track to mix under the new dub.

## Project folders

- `frontend/`: Angular source, development proxy, and npm configuration.
- `backend/`: FastAPI app, publisher integration, Python requirements, `bin/` FFmpeg binary, and served UI assets.
- `uploads/`: source videos and temporary media files created at the project root during development.
- `audio_segments/`: generated voice clips created at the project root during development.
- `outputs/`: exported videos and temporary render files created at the project root during development.
- `publisher_data/`: publishing credentials and tokens created at the project root during development.

Video files are local to this machine. A `.dubproj` stores project metadata and segment edits; it keeps references to local media. A `.dubpack` bundles the source video, generated speech clips, optional separated background track, and project manifest for transfer to another machine. Keep enough free disk space for the archive, which stores media without recompressing it.

## Optional audio models

These features are not installed by the normal setup and do not affect the default workflow.

### Speaker identity diarization

1. Accept the access conditions for [pyannote/speaker-diarization-community-1](https://huggingface.co/pyannote/speaker-diarization-community-1) on Hugging Face and create a read token for your account.
2. Install the optional dependency in the app environment: `python -m pip install -r backend/requirements-diarization.txt`.
3. In the same PowerShell window used to start the app, set `AI_DUBBER_HF_TOKEN` to the token. Optionally set `AI_DUBBER_DIARIZATION_DEVICE=cpu` or `cuda` (CPU is the default).
4. Restart the app and use **Auto Detect Speakers**. Without a configured token and installed package, the app reports that it used pitch suggestions instead.

### Dialogue and accompaniment separation

1. Install the optional dependency into the app environment: `.venv\Scripts\python.exe -m pip install -r backend\requirements-separation.txt`. [Demucs](https://github.com/facebookresearch/demucs) also requires PyTorch; if pip installs an unsuitable CPU/CUDA build, install the matching PyTorch build from the [official PyTorch selector](https://pytorch.org/get-started/locally/).
2. Restart the app and choose **Separate Dialogue**. The generated accompaniment is saved locally and mixed with the dubbed voices during video export. Choose **Use Original Audio** to clear it.
3. The first run downloads Demucs model weights. Processing is local and can be slow on long videos, especially on CPU.

To resume a long transcription, restore the autosaved project after restarting the page or app and click **Transcribe**. The app continues from the latest saved caption; use the same source video, which must still be present in `uploads/`.

## Configure and update

- The default upload limit is 20 GiB. Change it with `AI_DUBBER_MAX_UPLOAD_BYTES` before starting the app.
- The default `.dubpack` limit is twice the upload limit. Change it with `AI_DUBBER_MAX_PACKAGE_BYTES` if your video plus generated audio requires more space.
- Optional model settings: `AI_DUBBER_HF_TOKEN` and `AI_DUBBER_DIARIZATION_DEVICE` configure pyannote; `AI_DUBBER_DEMUCS_DEVICE` accepts `cpu` or `cuda` and defaults to CPU.
- Whisper defaults to the `base` model. Set `AI_DUBBER_WHISPER_MODEL` to a faster-whisper model name to trade memory and speed for transcription quality. Set `AI_DUBBER_WHISPER_DEVICE` to `auto`, `cpu`, or `cuda`; `auto` uses a detected CTranslate2 CUDA device when its Windows cuBLAS runtime is available and falls back to CPU otherwise.
- To update the backend, activate `.venv` and run `python -m pip install -r backend/requirements.txt`.
- To update the interface, run `npm ci` and `npm run build` from `frontend/`. The build is written to `backend/static/app/`.
- Run the Angular development UI with `npm start` in `frontend/`; it proxies API calls to the backend on port 8000.

## Troubleshooting

- If the app says FFmpeg is missing, make sure `backend/bin/ffmpeg.exe` exists or install the Python package `imageio-ffmpeg`, then restart.
- If uploads fail, check that the file is a supported video format, is below the configured limit, and there is enough free disk space. Check `/api/health` for FFmpeg and storage status.
- If translation fails, recheck the Gemini API key and selected model in Settings. Translation requires an internet connection and may use paid API quota.
- If the page does not show the current UI, run `setup.bat` with Node.js/npm installed to rebuild `backend/static/app/`.

## Development

From the project root, start the API with `cd backend` followed by `python -m uvicorn main:app --host 127.0.0.1 --port 8000 --reload`. In another terminal, run `npm start` from `frontend/` and open `http://localhost:4200`.
=======
# AI_DUBBER
>>>>>>> 1cee21a0443bf008d7806f556556d12c6c6c6cc8
