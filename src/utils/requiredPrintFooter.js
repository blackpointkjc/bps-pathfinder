export const REQUIRED_DCJS_FOOTER = 'DCJS ID: 11-30423 • KJC Security Solution LLC DBA Black Point Protection';
export const REQUIRED_CONFIDENTIAL_FOOTER = 'Confidential Document - For Official Use Only';

const FOOTER_ID = 'bps-required-print-footer';
const STYLE_ID = 'bps-required-print-footer-style';

function ensureFooter(targetDocument) {
  if (!targetDocument?.body || !targetDocument?.head) return;

  let style = targetDocument.getElementById(STYLE_ID);
  if (!style) {
    style = targetDocument.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      #${FOOTER_ID} {
        display: none;
      }
      @media print {
        @page {
          margin-bottom: 0.72in;
        }
        body {
          padding-bottom: 0.48in !important;
        }
        #${FOOTER_ID} {
          display: block !important;
          position: fixed;
          left: 0.25in;
          right: 0.25in;
          bottom: 0.08in;
          z-index: 2147483647;
          border-top: 1px solid #000;
          padding-top: 4px;
          background: #fff;
          color: #000;
          text-align: center;
          font-family: Arial, Helvetica, sans-serif;
          line-height: 1.2;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        #${FOOTER_ID} .bps-dcjs-line {
          font-size: 9pt;
          font-weight: 700;
        }
        #${FOOTER_ID} .bps-confidential-line {
          margin-top: 2px;
          font-size: 8pt;
          font-style: italic;
        }
      }
    `;
    targetDocument.head.appendChild(style);
  }

  let footer = targetDocument.getElementById(FOOTER_ID);
  if (!footer) {
    footer = targetDocument.createElement('div');
    footer.id = FOOTER_ID;
    footer.setAttribute('aria-hidden', 'true');
    footer.innerHTML = `
      <div class="bps-dcjs-line">${REQUIRED_DCJS_FOOTER}</div>
      <div class="bps-confidential-line">${REQUIRED_CONFIDENTIAL_FOOTER}</div>
    `;
    targetDocument.body.appendChild(footer);
  }
}

function patchPrintWindow(printWindow) {
  if (!printWindow || printWindow.__bpsRequiredFooterPatched) return printWindow;
  printWindow.__bpsRequiredFooterPatched = true;

  const nativePrint = printWindow.print?.bind(printWindow);
  if (nativePrint) {
    printWindow.print = () => {
      try {
        ensureFooter(printWindow.document);
      } catch (error) {
        console.warn('[Print Footer] Could not inject footer into print window:', error);
      }
      return nativePrint();
    };
  }

  try {
    printWindow.addEventListener('beforeprint', () => ensureFooter(printWindow.document));
  } catch {
    // Some browser-created windows may not be ready for listeners immediately.
  }

  return printWindow;
}

export function installRequiredPrintFooter() {
  if (typeof window === 'undefined' || window.__bpsRequiredFooterInstalled) return;
  window.__bpsRequiredFooterInstalled = true;

  const nativeOpen = window.open.bind(window);
  window.open = (...args) => patchPrintWindow(nativeOpen(...args));

  window.addEventListener('beforeprint', () => ensureFooter(document));
}

export function addRequiredPrintFooter(printWindow) {
  patchPrintWindow(printWindow);
  try {
    ensureFooter(printWindow?.document);
  } catch (error) {
    console.warn('[Print Footer] Could not add footer:', error);
  }
}
