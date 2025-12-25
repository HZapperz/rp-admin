import {
  Component,
  OnInit,
  OnDestroy,
  ViewChild,
  ElementRef,
  AfterViewInit
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { unpack } from '@rrweb/packer';
import {
  SessionRecordingService,
  RecordingSession,
  RecordingSessionEvent
} from '../../../core/services/session-recording.service';

@Component({
  selector: 'app-session-detail',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './session-detail.component.html',
  styleUrls: ['./session-detail.component.scss']
})
export class SessionDetailComponent implements OnInit, OnDestroy, AfterViewInit {
  @ViewChild('playerContainer') playerContainer!: ElementRef<HTMLDivElement>;

  session: RecordingSession | null = null;
  events: RecordingSessionEvent[] = [];
  isLoading = true;
  isLoadingEvents = false;
  error: string | null = null;
  player: any = null;

  sessionId: string = '';
  duration: string = '0s';
  deviceInfo: { device: string; browser: string } = { device: 'Unknown', browser: 'Unknown' };

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private sessionService: SessionRecordingService
  ) {}

  ngOnInit() {
    this.sessionId = this.route.snapshot.paramMap.get('sessionId') || '';
    if (this.sessionId) {
      this.loadSession();
    }
  }

  ngAfterViewInit() {
    // Player will be initialized after events are loaded
  }

  ngOnDestroy() {
    if (this.player) {
      this.player.pause();
      this.player = null;
    }
  }

  loadSession() {
    this.isLoading = true;
    this.error = null;

    this.sessionService.getSession(this.sessionId).subscribe({
      next: (session) => {
        if (!session) {
          this.error = 'Session not found';
          this.isLoading = false;
          return;
        }

        this.session = session;
        this.deviceInfo = this.sessionService.parseUserAgent(session.user_agent);
        this.isLoading = false;

        // Load events for replay
        this.loadEvents();
      },
      error: (err) => {
        console.error('Error loading session:', err);
        this.error = 'Failed to load session';
        this.isLoading = false;
      }
    });
  }

  loadEvents() {
    this.isLoadingEvents = true;

    this.sessionService.getSessionEvents(this.sessionId).subscribe({
      next: (events) => {
        this.events = events;
        const durationMs = this.sessionService.calculateDuration(events);
        this.duration = this.sessionService.formatDuration(durationMs);
        this.isLoadingEvents = false;

        // Initialize player after a tick to ensure DOM is ready
        setTimeout(() => this.initPlayer(), 100);
      },
      error: (err) => {
        console.error('Error loading events:', err);
        this.isLoadingEvents = false;
      }
    });
  }

  async initPlayer() {
    if (!this.playerContainer?.nativeElement || this.events.length === 0) {
      return;
    }

    try {
      // Decompress and flatten all events
      const allEvents: any[] = [];
      for (const chunk of this.events) {
        if (chunk.events && Array.isArray(chunk.events)) {
          for (const packedEvent of chunk.events) {
            try {
              const event = unpack(packedEvent);
              allEvents.push(event);
            } catch (e) {
              // If unpack fails, try using the event directly (might not be packed)
              allEvents.push(packedEvent);
            }
          }
        }
      }

      if (allEvents.length === 0) {
        console.warn('No events to replay');
        return;
      }

      // Sort events by timestamp
      allEvents.sort((a, b) => a.timestamp - b.timestamp);

      // Dynamically import rrweb-player (it's an ES module)
      const rrwebPlayer = await import('rrweb-player');
      const RRWebPlayer = rrwebPlayer.default;

      // Clear container
      this.playerContainer.nativeElement.innerHTML = '';

      // Create player
      this.player = new RRWebPlayer({
        target: this.playerContainer.nativeElement,
        props: {
          events: allEvents,
          showController: true,
          autoPlay: false,
          width: 800,
          height: 500,
          skipInactive: true,
          speedOption: [1, 2, 4, 8],
        },
      });
    } catch (err) {
      console.error('Error initializing player:', err);
    }
  }

  goBack() {
    this.router.navigate(['/sessions']);
  }

  getStatusLabel(): string {
    if (!this.session) return '';
    if (this.session.is_converted) return 'Converted';
    if (this.session.has_signed_up || this.session.user_id) return 'Signed Up';
    return 'Dropped';
  }

  getStatusClass(): string {
    if (!this.session) return '';
    if (this.session.is_converted) return 'status-converted';
    if (this.session.has_signed_up || this.session.user_id) return 'status-signed-up';
    return 'status-dropped';
  }

  formatDate(dateString: string): string {
    return new Date(dateString).toLocaleString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  }

  getReferrerDisplay(): string {
    if (!this.session?.referrer) return 'Direct';
    try {
      const url = new URL(this.session.referrer);
      return url.hostname;
    } catch {
      return this.session.referrer;
    }
  }

  getScreenSize(): string {
    if (!this.session?.screen_width || !this.session?.screen_height) {
      return 'Unknown';
    }
    return `${this.session.screen_width} x ${this.session.screen_height}`;
  }
}
