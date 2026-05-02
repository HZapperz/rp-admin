import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { DomSanitizer, SafeUrl } from '@angular/platform-browser';
import { SupabaseService } from '../../core/services/supabase.service';

interface ScheduledReminder {
  id: string;
  booking_id: string;
  user_id: string;
  notification_type: string;
  scheduled_for: string;
  status: string;
  sent_at?: string;
  // enriched
  client_name?: string;
  client_phone?: string;
  pet_names?: string;
  scheduled_date?: string;
  scheduled_time?: string;
}

interface ManualReminderBooking {
  id: string;
  scheduled_date: string;
  scheduled_time_start?: string;
  client_id?: string;
  client_first_name?: string;
  client_last_name?: string;
  client_phone?: string;
  pet_names?: string;
  has_missing_rabies?: boolean;
}

@Component({
  selector: 'app-reminders',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './reminders.component.html',
  styleUrls: ['./reminders.component.scss']
})
export class RemindersComponent implements OnInit {
  isLoadingAuto = true;
  isLoadingManual = true;
  errorAuto: string | null = null;
  errorManual: string | null = null;

  autoReminders: ScheduledReminder[] = [];
  manualReminders: ManualReminderBooking[] = [];

  activeTab: 'auto' | 'manual' = 'auto';

  constructor(
    private supabase: SupabaseService,
    private sanitizer: DomSanitizer
  ) {}

  async ngOnInit() {
    await Promise.all([this.loadAutoReminders(), this.loadManualReminders()]);
  }

  async loadAutoReminders() {
    try {
      this.isLoadingAuto = true;
      this.errorAuto = null;

      // Get pending + recently sent reminder.24h rows, next 7 days
      const now = new Date();
      const sevenDaysOut = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

      const { data, error } = await this.supabase
        .from('sms_scheduled')
        .select('*')
        .eq('notification_type', 'reminder.24h')
        .in('status', ['pending', 'sent'])
        .gte('scheduled_for', now.toISOString().split('T')[0])
        .lte('scheduled_for', sevenDaysOut.toISOString())
        .order('scheduled_for', { ascending: true });

      if (error) throw error;

      const rows: ScheduledReminder[] = data || [];

      // Enrich with booking + user info
      if (rows.length > 0) {
        const bookingIds = [...new Set(rows.map(r => r.booking_id).filter(Boolean))];
        const userIds = [...new Set(rows.map(r => r.user_id).filter(Boolean))];

        const [bookingsResp, usersResp] = await Promise.all([
          this.supabase
            .from('bookings')
            .select('id, scheduled_date, scheduled_time_start, booking_pets(pets(name, rabies_certificate_url))')
            .in('id', bookingIds),
          this.supabase
            .from('users')
            .select('id, first_name, last_name, phone')
            .in('id', userIds)
        ]);

        const bookingMap = new Map((bookingsResp.data || []).map((b: any) => [b.id, b]));
        const userMap = new Map((usersResp.data || []).map((u: any) => [u.id, u]));

        for (const row of rows) {
          const booking = bookingMap.get(row.booking_id) as any;
          const user = userMap.get(row.user_id) as any;
          if (booking) {
            row.scheduled_date = booking.scheduled_date;
            row.scheduled_time = booking.scheduled_time_start;
            const pets = (booking.booking_pets || []).map((bp: any) => bp.pets?.name).filter(Boolean);
            row.pet_names = pets.join(' & ') || 'Unknown pet';
          }
          if (user) {
            row.client_name = `${user.first_name} ${user.last_name}`.trim();
            row.client_phone = user.phone;
          }
        }
      }

      // Filter out reminders where the booking date has already passed
      // (e.g. booking was rescheduled to an earlier date but old reminder wasn't cleaned up)
      const todayStr = new Date().toISOString().split('T')[0];
      this.autoReminders = rows.filter(r => !r.scheduled_date || r.scheduled_date >= todayStr);
    } catch (err: any) {
      this.errorAuto = 'Failed to load automated reminders';
      console.error(err);
    } finally {
      this.isLoadingAuto = false;
    }
  }

  async loadManualReminders() {
    try {
      this.isLoadingManual = true;
      this.errorManual = null;

      const today = new Date().toISOString().split('T')[0];
      const sevenDaysOut = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      // Confirmed bookings in next 7 days where sms_consent = false
      const { data: bookings, error: bookingsError } = await this.supabase
        .from('bookings')
        .select('id, scheduled_date, scheduled_time_start, client_id, booking_pets(pets(name, rabies_certificate_url))')
        .eq('status', 'confirmed')
        .gte('scheduled_date', today)
        .lte('scheduled_date', sevenDaysOut)
        .order('scheduled_date', { ascending: true });

      if (bookingsError) throw bookingsError;

      if (!bookings || bookings.length === 0) {
        this.manualReminders = [];
        return;
      }

      const clientIds = [...new Set((bookings as any[]).map(b => b.client_id).filter(Boolean))];
      const { data: users } = await this.supabase
        .from('users')
        .select('id, first_name, last_name, phone, sms_consent')
        .in('id', clientIds);

      const userMap = new Map(((users || []) as any[]).map(u => [u.id, u]));

      const result: ManualReminderBooking[] = [];
      for (const booking of bookings as any[]) {
        const user = userMap.get(booking.client_id);
        if (!user || user.sms_consent !== false) continue;

        const pets = (booking.booking_pets || []).map((bp: any) => bp.pets?.name).filter(Boolean);
        const hasMissingRabies = (booking.booking_pets || []).some((bp: any) => !bp.pets?.rabies_certificate_url);

        result.push({
          id: booking.id,
          scheduled_date: booking.scheduled_date,
          scheduled_time_start: booking.scheduled_time_start,
          client_id: user.id,
          client_first_name: user.first_name,
          client_last_name: user.last_name,
          client_phone: user.phone,
          pet_names: pets.join(' & ') || 'Unknown pet',
          has_missing_rabies: hasMissingRabies
        });
      }

      this.manualReminders = result;
    } catch (err: any) {
      this.errorManual = 'Failed to load manual reminders';
      console.error(err);
    } finally {
      this.isLoadingManual = false;
    }
  }

  formatDate(dateStr: string): string {
    const d = new Date(dateStr + 'T00:00:00Z');
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
  }

  formatSendTime(isoStr: string): string {
    const d = new Date(isoStr);
    return d.toLocaleString('en-US', {
      month: 'short', day: 'numeric',
      hour: 'numeric', minute: '2-digit',
      timeZone: 'America/Chicago'
    }) + ' CT';
  }

  formatApptTime(timeStr: string): string {
    if (!timeStr) return '';
    const parts = timeStr.split(':');
    return new Date(0, 0, 0, parseInt(parts[0], 10), parseInt(parts[1], 10))
      .toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }

  getStatusClass(status: string): string {
    return status === 'sent' ? 'status-sent' : 'status-pending';
  }

  getManualSmsUrl(booking: ManualReminderBooking): SafeUrl {
    const phone = booking.client_phone || '';
    if (!phone) return this.sanitizer.bypassSecurityTrustUrl('');

    const firstName = booking.client_first_name || '';
    const petNames = booking.pet_names || 'your pet';
    const timeDisplay = booking.scheduled_time_start
      ? this.formatApptTime(booking.scheduled_time_start)
      : '';

    const rabiesPart = booking.has_missing_rabies
      ? ` We still need a current rabies certificate for ${petNames} — please upload it at royalpawzusa.com (log in, go to My Pets, and tap Rabies Certificate) before tomorrow. For queries call (832) 504-0760.`
      : '';

    const msg = `Hi ${firstName}! Reminder: ${petNames}'s grooming is tomorrow at ${timeDisplay}.${rabiesPart} See you soon! 🐾`;
    return this.sanitizer.bypassSecurityTrustUrl(`sms:${phone}&body=${encodeURIComponent(msg)}`);
  }

  setTab(tab: 'auto' | 'manual') {
    this.activeTab = tab;
  }
}
