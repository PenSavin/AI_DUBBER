import { AfterViewInit, Component } from '@angular/core';

@Component({
  selector: 'app-dubbing-workspace',
  templateUrl: './dubbing-workspace.component.html',
  styles: [':host { display: contents; }'],
})
export class DubbingWorkspaceComponent implements AfterViewInit {
  async ngAfterViewInit(): Promise<void> {
    try {
      await this.loadLegacyScript('/static/js/i18n.js');
      await this.loadLegacyScript('/static/js/app.js');
      (window as Window & { lucide?: { createIcons: () => void } }).lucide?.createIcons();
    } catch (error) {
      console.error('AI DUBBER could not initialize its workspace scripts.', error);
    }
  }

  private loadLegacyScript(source: string): Promise<void> {
    const selector = `script[data-ai-dubber-script="${source}"]`;
    if (document.querySelector(selector)) return Promise.resolve();

    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      // The legacy workspace logic changes independently of the Angular shell.
      // Give each page load a fresh URL so the browser cannot keep an old progress UI.
      script.src = `${source}?v=${Date.now()}`;
      script.dataset['aiDubberScript'] = source;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error(`Failed to load ${source}`));
      document.body.appendChild(script);
    });
  }
}
