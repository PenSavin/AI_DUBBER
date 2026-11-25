"""Desktop window for the local AI DUBBER application."""

from __future__ import annotations

import logging
import os
import socket
import threading
import time
from pathlib import Path
from tkinter import messagebox


HOST = "127.0.0.1"
PORT = 8000
URL = f"http://{HOST}:{PORT}"
STARTUP_TIMEOUT_SECONDS = 180

STARTUP_HTML = """<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>AI DUBBER</title>
  <style>
    :root { color-scheme: dark; font-family: "Segoe UI", sans-serif; }
    body { margin: 0; min-height: 100vh; display: grid; place-items: center;
           background: #111827; color: #f9fafb; }
    main { width: min(440px, calc(100% - 48px)); text-align: center; }
    h1 { margin-bottom: 10px; font-size: 27px; }
    p { color: #cbd5e1; line-height: 1.6; }
    .spinner { width: 28px; height: 28px; margin: 30px auto 0; border: 3px solid #374151;
               border-top-color: #60a5fa; border-radius: 50%; animation: spin 0.9s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
  </style>
</head>
<body>
  <main>
    <h1>AI Movie Translator and Dubber</h1>
    <p id="status">Starting the local app. This can take a moment.</p>
    <div class="spinner" aria-hidden="true"></div>
  </main>
</body>
</html>"""


def configure_data_directory() -> Path:
    local_app_data = os.environ.get("LOCALAPPDATA")
    if local_app_data:
        data_dir = Path(local_app_data) / "AI DUBBER"
    else:
        data_dir = Path.home() / "AppData" / "Local" / "AI DUBBER"
    data_dir.mkdir(parents=True, exist_ok=True)
    os.environ["AI_DUBBER_DATA_DIR"] = str(data_dir)
    return data_dir


class DesktopApp:
    def __init__(self) -> None:
        self.data_dir = configure_data_directory()
        self.log_path = self.data_dir / "desktop.log"
        logging.basicConfig(
            filename=str(self.log_path),
            level=logging.INFO,
            format="%(asctime)s %(levelname)s %(message)s",
            encoding="utf-8",
        )
        self.server = None
        self.server_thread: threading.Thread | None = None
        self.stop_requested = threading.Event()
        self.startup_error: str | None = None

    def _serve(self) -> None:
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
                probe.bind((HOST, PORT))

            import uvicorn
            import main

            if self.stop_requested.is_set():
                return

            config = uvicorn.Config(
                main.app,
                host=HOST,
                port=PORT,
                log_config=None,
                access_log=False,
                lifespan="on",
            )
            self.server = uvicorn.Server(config)
            self.server.run()
        except Exception as exc:
            self.startup_error = str(exc)
            logging.exception("The local server stopped with an error")

    def _load_app_when_ready(self, window) -> None:
        deadline = time.monotonic() + STARTUP_TIMEOUT_SECONDS
        while not self.stop_requested.is_set():
            if self.server and self.server.started:
                window.load_url(URL)
                return

            if self.startup_error:
                window.load_html(self._error_page(self.startup_error))
                return

            if self.server_thread and not self.server_thread.is_alive():
                window.load_html(self._error_page("The local service stopped before it was ready."))
                return

            if time.monotonic() >= deadline:
                window.load_html(self._error_page("The local service took too long to start."))
                return

            time.sleep(0.25)

    def _error_page(self, detail: str) -> str:
        safe_detail = (
            detail.replace("&", "&amp;")
            .replace("<", "&lt;")
            .replace(">", "&gt;")
        )
        safe_log = str(self.log_path).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
        return f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>AI DUBBER could not start</title>
<style>body{{font:16px 'Segoe UI',sans-serif;background:#111827;color:#f9fafb;margin:0;padding:64px;}}
main{{max-width:680px;margin:auto}}p{{color:#cbd5e1;line-height:1.6}}code{{overflow-wrap:anywhere}}</style>
</head><body><main><h1>AI DUBBER could not start</h1><p>{safe_detail}</p>
<p>See the log for details: <code>{safe_log}</code></p></main></body></html>"""

    def _window_closed(self, *_args) -> None:
        self.stop_requested.set()
        if self.server:
            self.server.should_exit = True

    def _stop_server(self) -> None:
        self.stop_requested.set()
        if self.server:
            self.server.should_exit = True
        if self.server_thread and self.server_thread.is_alive():
            self.server_thread.join(timeout=15)

    def run(self) -> None:
        try:
            import webview
        except Exception:
            logging.exception("Could not import pywebview")
            messagebox.showerror(
                "AI DUBBER could not open",
                f"The desktop window could not be loaded. See this log for details:\n{self.log_path}",
            )
            return

        self.server_thread = threading.Thread(target=self._serve, name="ai-dubber-server", daemon=True)
        self.server_thread.start()

        window = webview.create_window(
            "AI Movie Translator and Dubber",
            html=STARTUP_HTML,
            width=1380,
            height=900,
            min_size=(980, 680),
            text_select=True,
        )
        window.events.closed += self._window_closed

        try:
            webview.start(
                self._load_app_when_ready,
                args=(window,),
                gui="edgechromium",
                private_mode=False,
                storage_path=str(self.data_dir / "webview"),
            )
        except Exception as exc:
            logging.exception("Could not open the embedded desktop window")
            self._stop_server()
            messagebox.showerror(
                "AI DUBBER could not open",
                "AI DUBBER needs the Microsoft Edge WebView2 Runtime to display its desktop window. "
                f"Install the runtime, then try again.\n\nDetails: {exc}\n\nLog: {self.log_path}",
            )
            return

        self._stop_server()


if __name__ == "__main__":
    DesktopApp().run()
