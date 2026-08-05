import React from "react";
import { format } from "date-fns";

const LOGO_URL = "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/69503da793f3e1140bbd4426/857a5f1c1_UntitledProject3.png";

export const generateTimeClockPrint = (entries, officerName, startDate, endDate) => {
  const totalMinutes = entries.reduce((sum, entry) => {
    if (entry.clock_out) {
      const diff = new Date(entry.clock_out) - new Date(entry.clock_in);
      return sum + (diff / 1000 / 60);
    }
    return sum;
  }, 0);
  
  const totalHours = Math.floor(totalMinutes / 60);
  const totalMins = Math.floor(totalMinutes % 60);

  const printWindow = window.open('', '', 'width=850,height=1100');
  
  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Time Clock Report - ${officerName}</title>
      <style>
        @page { size: 8.5in 11in; margin: 0.25in; }
        @media print {
          .no-print { display: none !important; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .report-container { page-break-inside: avoid; }
        }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 8pt; line-height: 1.2; color: #1a1a1a; }
        
        .back-button {
          position: fixed;
          top: 10px;
          left: 10px;
          padding: 8px 16px;
          background: #1e40af;
          color: white;
          border: none;
          border-radius: 6px;
          cursor: pointer;
          font-size: 14px;
          font-weight: 600;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
          z-index: 9999;
        }
        .back-button:hover { background: #1e3a8a; }
        
        .report-container { border: 2px solid #1e40af; border-radius: 6px; overflow: hidden; }
        .header { background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%); color: white; padding: 10px; text-align: center; }
        .logo { width: 180px; height: auto; object-fit: contain; margin: 0 auto 8px; }
        .title { font-size: 14pt; font-weight: bold; letter-spacing: 1px; margin-bottom: 2px; }
        .subtitle { font-size: 10pt; font-weight: 500; opacity: 0.95; }
        .dcjs { font-size: 7pt; margin-top: 4px; opacity: 0.9; }
        
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
        tbody tr:hover { background: #f8fafc; }
        
        .footer { background: #1e293b; color: white; padding: 8px; text-align: center; font-size: 7pt; margin-top: 8px; border-radius: 0 0 4px 4px; }
        .footer strong { font-size: 8pt; display: block; margin-bottom: 2px; }
      </style>
    </head>
    <body>
      <button class="back-button no-print" onclick="window.close()">← Back to App</button>
      
      <div class="report-container">
        <div class="header">
          <img src="${LOGO_URL}" alt="Black Point Protection" class="logo" />
          <div class="title">TIME CLOCK REPORT</div>
          <div class="subtitle">${officerName}</div>
          <div class="dcjs">VA DCJS #11-6066 | Maryland #106-4738</div>
        </div>
        
        <div class="meta-bar">
          <div class="meta-item">
            <span class="meta-label">Period</span>
            <span class="meta-value">${format(new Date(startDate), 'MMM d, yyyy')} - ${format(new Date(endDate), 'MMM d, yyyy')}</span>
          </div>
          <div class="meta-item">
            <span class="meta-label">Total Entries</span>
            <span class="meta-value">${entries.length}</span>
          </div>
          <div class="meta-item">
            <span class="meta-label">Generated</span>
            <span class="meta-value">${format(new Date(), 'M/d/yyyy h:mm a')}</span>
          </div>
        </div>

        <div class="summary-box">
          <div class="label">Total Hours Worked</div>
          <div class="total">${totalHours}h ${totalMins}m</div>
        </div>
        
        <div class="content">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Clock In</th>
                <th>Clock Out</th>
                <th>Location</th>
                <th style="text-align: right;">Hours</th>
              </tr>
            </thead>
            <tbody>
              ${entries.map(entry => {
                const hours = entry.clock_out ? Math.floor((new Date(entry.clock_out) - new Date(entry.clock_in)) / 1000 / 60 / 60) : 0;
                const minutes = entry.clock_out ? Math.floor(((new Date(entry.clock_out) - new Date(entry.clock_in)) / 1000 / 60) % 60) : 0;
                return `
                  <tr>
                    <td>${format(new Date(entry.clock_in), 'MMM d, yyyy')}</td>
                    <td>${format(new Date(entry.clock_in), 'h:mm a')}</td>
                    <td>${entry.clock_out ? format(new Date(entry.clock_out), 'h:mm a') : 'Active'}</td>
                    <td>${entry.location}</td>
                    <td style="text-align: right; font-weight: 600;">${hours}h ${minutes}m</td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
        
        <div class="footer">
          <strong>BLACK POINT PROTECTION</strong>
          <div style="margin-top: 5px;">VA DCJS #11-6066 | Maryland #106-4738</div>
          <div style="margin-top: 3px;">Richmond, VA | Employee Time Record</div>
        </div>
      </div>
      
      <script>
        window.onload = function() { 
          setTimeout(() => { window.print(); }, 500);
        }
      </script>
    </body>
    </html>
  `);
  
  printWindow.document.close();
};