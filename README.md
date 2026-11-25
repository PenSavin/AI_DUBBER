# AI DUBBER

AI DUBBER is a local-first Windows app for transcribing video dialogue, translating it into Khmer, generating dubbed speech, and exporting finished videos. Video processing and project files stay on your computer; translation uses Google Gemini and voice generation uses Edge TTS.

## Features

- Upload a video or download one from a supported URL. URL downloads show progress, speed, and an estimated time remaining when the source provides enough information.
- Transcribe speech locally with faster-whisper. Long transcriptions stream captions as they arrive and can resume from the latest saved caption.
- Translate and review dialogue, edit segment timing, assign speaker voices, and generate Khmer speech.
- Export dubbed MP4 videos with subtitles, or download SRT and WebVTT subtitle files.
- Create vertical clips with Auto make Reels, save projects as `.dubproj`, or bundle media and edits into a portable `.dubpack`.
- Use optional speaker identity diarization and dialogue/accompaniment separation.
- Publish or schedule finished videos to YouTube and Facebook Pages.

Use videos you own or have permission to edit and publish.

## Requirements

- Windows 10 or 11 and Python 3.10 or newer.
- FFmpeg is included at `backend/bin/ffmpeg.exe`.
- Node.js and npm are optional for running the bundled UI. They are needed to rebuild the Angular interface.
- Internet access is required for Gemini translation, Edge TTS voice generation, URL downloads, and first-time model downloads.

## Quick start

1. Run `setup.bat`. It creates `.venv`, installs the backend dependencies, and builds the UI when npm is available.
2. Run `run.bat` and open [http://127.0.0.1:8000](http://127.0.0.1:8000).
3. Open **Settings**, add a Google Gemini API key, and select a model before translating.

The API key is stored in the current browser's local storage and sent to the local backend when testing the key or translating.

## Workflow

1. Upload a video or paste a supported video URL.
2. Select **Transcribe**. The first run downloads the selected Whisper model.
3. Translate the transcript, then review and adjust the text, timing, and speaker assignments.
4. Generate voice clips and preview the result. Choose whether to keep the original audio or use a separated accompaniment track.
5. Export the dubbed video, download subtitles, or create short vertical clips.
6. Save a `.dubproj` to keep edits and local file references, or export a `.dubpack` to transfer the project with its media.

Auto make Reels selects up to five dialogue-dense moments using caption timing. It can add translated captions when available and uses a blurred background to fill the vertical frame. It does not evaluate story meaning or identify faces.

## Local processing and data

Transcription and FFmpeg rendering run on this computer. The source video is not sent to Gemini; transcript text is sent for translation. Translated speech text is sent to the online Edge TTS service for voice generation.

In a source checkout, uploads, audio segments, exports, and publisher credentials are stored in the project data folders: `uploads/`, `audio_segments/`, `outputs/`, and `publisher_data/`. The packaged desktop app stores writable data under `%LOCALAPPDATA%\AI DUBBER`. Set `AI_DUBBER_DATA_DIR` to choose a different data directory.

A `.dubproj` stores project settings and segment edits while referring to local media files. A `.dubpack` includes the source video, generated audio, optional separated background track, and project manifest. Packages do not recompress media, so allow enough free disk space.

## Optional audio features

These add-ons are not installed by the standard setup.

### Speaker identity diarization

By default, automatic speaker suggestions use pitch and do not identify recurring people. To enable pyannote diarization:

1. Accept the access conditions for [pyannote/speaker-diarization-community-1](https://huggingface.co/pyannote/speaker-diarization-community-1) and create a Hugging Face read token.
2. Install the add-on into the app environment:

   ```powershell
   .venv\Scripts\python.exe -m pip install -r backend\requirements-diarization.txt
   ```

3. In the same PowerShell window used to start the app, set `AI_DUBBER_HF_TOKEN` to your token. Optionally set `AI_DUBBER_DIARIZATION_DEVICE` to `cpu` or `cuda`.
4. Restart the app and choose **Auto Detect Speakers**.

### Dialogue and accompaniment separation

Install Demucs into the app environment, then restart the app:

```powershell
.venv\Scripts\python.exe -m pip install -r backend\requirements-separation.txt
```

Choose **Separate Dialogue** to create an accompaniment track for export. The first run downloads model weights, and processing can be slow on long videos, especially on CPU. Set `AI_DUBBER_DEMUCS_DEVICE` to `cpu` or `cuda` if needed. Use the [official PyTorch selector](https://pytorch.org/get-started/locally/) if pip installs a CPU/CUDA build that does not suit your system.

The packaged desktop EXE does not include pyannote or Demucs. Use the Python app started with `run.bat` to use these add-ons.

## Publish YouTube Shorts and Facebook Reels

The publishing panel can upload a finished video from `outputs/` immediately or schedule it through the platform APIs. The app does not need to stay open after a platform accepts a scheduled post.

### YouTube

1. In Google Cloud Console, create a project, enable **YouTube Data API v3**, and create an OAuth client for a desktop application.
2. In the publishing panel, select the downloaded OAuth client JSON and choose **Connect YouTube**.
3. Approve access in the browser, then choose a finished video and enter its publishing details.

### Facebook Page

1. Create a Meta developer app and enable Facebook Login.
2. Add the callback URL shown in the publishing panel to the app's Valid OAuth Redirect URIs.
3. Configure the requested Page permissions, then enter the Meta App ID and App Secret in the publishing panel.
4. Connect Facebook and select the Page to publish to.

Publishing requires confirmation that you have rights to post the selected video. The AI disclosure option is enabled by default. OAuth details and tokens are stored in the local `publisher_data/` folder; do not share that folder.

## Configuration

- `AI_DUBBER_MAX_UPLOAD_BYTES`: upload limit; defaults to 20 GiB.
- `AI_DUBBER_MAX_PACKAGE_BYTES`: `.dubpack` limit; defaults to twice the upload limit.
- `AI_DUBBER_DATA_DIR`: location for uploads, exports, audio segments, and publisher data.
- `AI_DUBBER_WHISPER_MODEL`: faster-whisper model name; defaults to `base`.
- `AI_DUBBER_WHISPER_DEVICE`: `auto`, `cpu`, or `cuda`. `auto` uses a detected CTranslate2 CUDA device when available and otherwise falls back to CPU.
- `AI_DUBBER_WHISPER_COMPUTE_TYPE` and `AI_DUBBER_WHISPER_COMPUTE_TYPE_CPU`: optional compute type settings.
- `AI_DUBBER_HF_TOKEN` and `AI_DUBBER_DIARIZATION_DEVICE`: configure optional pyannote diarization.
- `AI_DUBBER_DEMUCS_DEVICE`: `cpu` or `cuda` for optional Demucs separation; defaults to `cpu`.

Set environment variables before starting the app. Restart the app after changing them.

The local health check is [http://127.0.0.1:8000/api/health](http://127.0.0.1:8000/api/health). Interactive API documentation is at [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs).

## Build the Windows desktop app

1. Run `setup.bat`.
2. Run `build_exe.bat`.
3. Copy the entire `dist\AI DUBBER` folder to a writable location and launch `AI DUBBER.exe`.

The executable uses the Microsoft Edge WebView2 Runtime. Packaged app data is saved under `%LOCALAPPDATA%\AI DUBBER`; copy the entire folder when moving the app. Optional pyannote and Demucs add-ons are not bundled.

## Development

Start the backend from the project root:

```powershell
.venv\Scripts\python.exe -m uvicorn main:app --app-dir backend --host 127.0.0.1 --port 8000 --reload
```

In another terminal, start the Angular development server:

```powershell
cd frontend
npm start
```

Open [http://localhost:4200](http://localhost:4200). The dev server proxies API requests to the backend on port 8000.

To update the UI dependencies and production bundle, run `npm ci` and `npm run build` from `frontend/`. The production UI is written to `backend/static/app/`. To reinstall backend dependencies, run `.venv\Scripts\python.exe -m pip install -r backend\requirements.txt` from the project root.

## Troubleshooting

- **FFmpeg is missing:** Check that `backend/bin/ffmpeg.exe` exists. In a source setup, reinstalling the backend requirements also installs `imageio-ffmpeg` as a fallback.
- **Upload fails:** Check the file format, upload limit, available disk space, and the `/api/health` report.
- **Translation fails:** Check the Gemini API key, selected model, internet connection, and available API quota.
- **Dialogue separation is unavailable:** Install `backend/requirements-separation.txt` into `.venv` as shown above, then restart with `run.bat`. The packaged EXE does not contain Demucs.
- **The interface looks outdated:** Refresh the page. To rebuild the bundled UI, install Node.js/npm and run `setup.bat` or the frontend build commands above.
