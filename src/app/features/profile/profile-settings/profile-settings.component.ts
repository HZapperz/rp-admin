import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-profile-settings',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="feature-placeholder">
      <h1>⚙️ Admin Profile Settings</h1>
      <p>This feature is coming soon.</p>
    </div>
  `,
  styles: [`
    .feature-placeholder {
      padding: 2rem;
      text-align: center;
      h1 { font-size: 2rem; margin-bottom: 1rem; }
      p { color: #64748b; }
    }
  `]
})
export class ProfileSettingsComponent {}
