import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SupabaseService } from '../../core/services/supabase.service';

interface TestResult {
  testName: string;
  period: string;
  totalEntered: number;
  entriesA: number;
  entriesB: number;
  // Hero: bookings converted
  convertedCountA: number;
  convertedCountB: number;
  convertedRateA: number;
  convertedRateB: number;
  // Secondary: ZIP submitted
  zipCountA: number;
  zipCountB: number;
  zipRateA: number;
  zipRateB: number;
  // Footnote
  introCountA: number;
}

type Period = '7d' | '30d' | 'all';

@Component({
  selector: 'app-ab-tests',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './ab-tests.component.html',
  styleUrls: ['./ab-tests.component.scss']
})
export class AbTestsComponent implements OnInit {
  result: TestResult | null = null;
  isLoading = true;
  selectedPeriod: Period = '7d';

  periods: { value: Period; label: string }[] = [
    { value: '7d',  label: '7 Days' },
    { value: '30d', label: '30 Days' },
    { value: 'all', label: 'All Time' },
  ];

  constructor(private supabase: SupabaseService) {}

  ngOnInit() {
    this.load();
  }

  async load() {
    this.isLoading = true;

    const cutoff = this.getCutoff(this.selectedPeriod);

    let query = this.supabase
      .from('ab_test_events')
      .select('variant, event, session_id')
      .eq('test_name', 'book_intro_vs_zip');

    if (cutoff) {
      query = query.gte('created_at', cutoff);
    }

    const { data, error } = await query;

    if (error || !data) {
      this.isLoading = false;
      return;
    }

    const sets: { A: { [event: string]: Set<string> }; B: { [event: string]: Set<string> } } = {
      A: {}, B: {}
    };

    for (const row of data) {
      const v = row.variant as 'A' | 'B';
      if (!sets[v][row.event]) sets[v][row.event] = new Set();
      sets[v][row.event].add(row.session_id);
    }

    // Union of all session_ids per variant = total participants
    const allSessionsA = new Set<string>();
    const allSessionsB = new Set<string>();
    for (const s of Object.values(sets.A)) for (const id of s) allSessionsA.add(id);
    for (const s of Object.values(sets.B)) for (const id of s) allSessionsB.add(id);

    const entriesA = allSessionsA.size;
    const entriesB = allSessionsB.size;

    const convertedCountA = sets.A['converted']?.size ?? 0;
    const convertedCountB = sets.B['converted']?.size ?? 0;
    const zipCountA = sets.A['zip_submitted']?.size ?? 0;
    const zipCountB = sets.B['zip_submitted']?.size ?? 0;

    this.result = {
      testName: 'Intro Screen vs. ZIP First',
      period: this.periods.find(p => p.value === this.selectedPeriod)?.label ?? '',
      totalEntered: entriesA + entriesB,
      entriesA,
      entriesB,
      convertedCountA,
      convertedCountB,
      convertedRateA: entriesA > 0 ? convertedCountA / entriesA : 0,
      convertedRateB: entriesB > 0 ? convertedCountB / entriesB : 0,
      zipCountA,
      zipCountB,
      zipRateA: entriesA > 0 ? zipCountA / entriesA : 0,
      zipRateB: entriesB > 0 ? zipCountB / entriesB : 0,
      introCountA: sets.A['intro_started']?.size ?? 0,
    };

    this.isLoading = false;
  }

  selectPeriod(period: Period) {
    this.selectedPeriod = period;
    this.load();
  }

  getConvertedWinner(): 'A' | 'B' | 'tie' | null {
    if (!this.result) return null;
    const { convertedRateA, convertedRateB } = this.result;
    if (Math.abs(convertedRateA - convertedRateB) < 0.01) return 'tie';
    return convertedRateA > convertedRateB ? 'A' : 'B';
  }

  getConvertedLift(): string {
    if (!this.result || !this.result.convertedRateA) return '—';
    const lift = ((this.result.convertedRateB - this.result.convertedRateA) / this.result.convertedRateA) * 100;
    const sign = lift > 0 ? '+' : '';
    return `${sign}${lift.toFixed(1)}%`;
  }

  getZipWinner(): 'A' | 'B' | 'tie' | null {
    if (!this.result) return null;
    const { zipRateA, zipRateB } = this.result;
    if (Math.abs(zipRateA - zipRateB) < 0.01) return 'tie';
    return zipRateA > zipRateB ? 'A' : 'B';
  }

  formatRate(rate: number): string {
    return (rate * 100).toFixed(1) + '%';
  }

  splitPct(n: number, total: number): string {
    if (!total) return '0%';
    return (n / total * 100).toFixed(0) + '%';
  }

  private getCutoff(period: Period): string | null {
    if (period === 'all') return null;
    const days = period === '7d' ? 7 : 30;
    const d = new Date();
    d.setDate(d.getDate() - days);
    return d.toISOString();
  }
}
