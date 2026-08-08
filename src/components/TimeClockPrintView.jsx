const EASTERN_TZ = 'America/New_York';

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function formatEastern(value, options) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-US', { timeZone: EASTERN_TZ, ...options }).format(date);
}

function calculateEntryMinutes(entry) {
  if (!entry?.clock_in || !entry?.clock_out) return 0;
  const grossMs = new Date(entry.clock_out).getTime() - new Date(entry.clock_in).getTime();
  if (!Number.isFinite(grossMs) || grossMs <= 0) return 0;
  const breakMs = (entry.break_periods || []).reduce((total, period) => {
    if (!period?.start || !period?.end) return total;
    const duration = new Date(period.end).getTime() - new Date(period.start).getTime();
    return total + (Number.isFinite(duration) && duration > 0 ? duration : 0);
  }, 0);
  return Math.max(0, Math.round((grossMs - breakMs) / 60000));
}

function formatMinutes(minutes) {
  const safeMinutes = Math.max(0, Math.round(Number(minutes) || 0));
  return `${Math.floor(safeMinutes / 60)}h ${safeMinutes % 60}m`;
}

export const generateTimeClockPrint = (entries = [], officerName, startDate, endDate) => {
  const completedEntries = (entries || []).filter(entry => entry?.clock_in && entry?.clock_out && entry.archived !== true);
  const totalMinutes = completedEntries.reduce((sum, entry) => sum + calculateEntryMinutes(entry), 0);
  const printWindow = window.open('', '', 'width=850,height=1100');
  if (!printWindow) {
    window.alert('Unable to open the print report. Please allow pop-ups for Pathfinder and try again.');
    return;
  }

  const periodStart = formatEastern(`${startDate}T12:00:00`, { month: 'short', day: 'numeric', year: 'numeric' });
  const periodEnd = formatEastern(`${endDate}T12:00:00`, { month: 'short', day: 'numeric', year: 'numeric' });
  const generated = formatEastern(new Date(), { month: 'numeric', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });

  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Time Clock Report - ${escapeHtml(officerName)}</title>
      <style>
        @page { size: 8.5in 11in; margin: 0.25in; }
        @media print {
          .no-print { display: none !important; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .report-container { page-break-inside: avoid; }
        }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 8pt; line-height: 1.2; color: #1a1a1a; }
        .back-button { position: fixed; top: 10px; left: 10px; padding: 8px 16px; background: #1e40af; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 14px; font-weight: 600; box-shadow: 0 2px 4px rgba(0,0,0,0.1); z-index: 9999; }
        .report-container { border: 2px solid #1e40af; border-radius: 6px; overflow: hidden; }
        .header { background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%); color: white; padding: 10px; text-align: center; }
        .title { font-size: 14pt; font-weight: bold; letter-spacing: 1px; margin-bottom: 2px; }
        .subtitle { font-size: 10pt; font-weight: 500; opacity: 0.95; }
        .meta-bar { background: #f8fafc; padding: 6px 12px; border-bottom: 1px solid #e2e8f0; display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
        .meta-item { font-size: 7pt; }
        .meta-label { font-weight: 600; color: #475569; display: block; }
        .meta-value { color: #1e293b; font-weight: bold; }
        .summary-box { background: #dbeafe; padding: 8px; margin: 8px 12px; border-radius: 4px; text-align: center; }
        .summary-box .total { font-size: 18pt; font-weight: bold; color: #1e40af; }
        .summary-box .label { font-size: 8pt; color: #1e40af; margin-bottom: 2px; }
        .content { padding: 8px 12px; }
        table { width: 100%; border-collapse: collapse; margin-top: 4px; }
        thead { background: #f1f5f9; }
        th { padding: 4px 6px; text-align: left; font-size: 7pt; font-weight: 600; color: #475569; border-bottom: 1px solid #cbd5e1; }
        td { padding: 3px 6px; font-size: 7pt; border-bottom: 1px solid #e2e8f0; }
        .footer { background: #1e293b; color: white; padding: 8px; text-align: center; font-size: 7pt; margin-top: 8px; }
      </style>
    </head>
    <body>
      <button class="back-button no-print" onclick="window.close()">← Back to App</button>
      <div class="report-container">
        <div class="header"><div class="title">TIME CLOCK REPORT</div><div class="subtitle">${escapeHtml(officerName)}</div></div>
        <div class="meta-bar">
          <div class="meta-item"><span class="meta-label">Period</span><span class="meta-value">${periodStart} - ${periodEnd}</span></div>
          <div class="meta-item"><span class="meta-label">Completed Entries</span><span class="meta-value">${completedEntries.length}</span></div>
          <div class="meta-item"><span class="meta-label">Generated</span><span class="meta-value">${generated} ET</span></div>
        </div>
        <div class="summary-box"><div class="label">Total Hours Worked (after recorded breaks)</div><div class="total">${formatMinutes(totalMinutes)}</div></div>
        <div class="content">
          <table>
            <thead><tr><th>Date</th><th>Clock In</th><th>Clock Out</th><th>Location</th><th style="text-align:right;">Hours</th></tr></thead>
            <tbody>
              ${completedEntries.map(entry => `
                <tr>
                  <td>${formatEastern(entry.clock_in, { month: 'short', day: 'numeric', year: 'numeric' })}</td>
                  <td>${formatEastern(entry.clock_in, { hour: 'numeric', minute: '2-digit' })}</td>
                  <td>${formatEastern(entry.clock_out, { hour: 'numeric', minute: '2-digit' })}</td>
                  <td>${escapeHtml(entry.location || '—')}</td>
                  <td style="text-align:right;font-weight:600;">${formatMinutes(calculateEntryMinutes(entry))}</td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
        <div class="footer"><div>Richmond, VA | Employee Time Record | Times shown in Eastern Time</div></div>
      </div>
      <script>window.onload = function() { setTimeout(() => window.print(), 300); };</script>
    </body>
    </html>
  `);
  printWindow.document.close();
};