import { Component } from '@angular/core';
import { DubbingWorkspaceComponent } from './dubbing-workspace.component';

@Component({
  standalone: true,
  selector: 'app-root',
  imports: [DubbingWorkspaceComponent],
  templateUrl: './app.component.html',
  styles: [':host { display: contents; }'],
})
export class App {}
