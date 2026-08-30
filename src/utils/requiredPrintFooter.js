export const REQUIRED_DCJS_FOOTER = 'DCJS ID: 11-30423 • KJC Security Solution LLC DBA Black Point Protection';
export const REQUIRED_CONFIDENTIAL_FOOTER = 'Confidential Document - For Official Use Only';

const FOOTER_ID = 'bps-required-print-footer';
const STYLE_ID = 'bps-required-print-footer-style';
const AUTOFIT_STYLE_ID = 'bps-global-print-autofit-style';
const LETTER_PORTRAIT = { width: 816, height: 1056 };
const LETTER_LANDSCAPE = { width: 1056, height: 816 };
const PRINT_MARGIN_X = 58;
const PRINT_MARGIN_Y = 76;
const MIN_READABLE_SCALE = 0.62;

function printableDocumentSize(targetDocument) {
  if (!targetDocument?.body || !targetDocument?.documentElement) return { width: 0, height: 0 };
  const candidates = Array.from(targetDocument.body.children || []).filter(node => {
    if (!(node instanceof targetDocument.defaultView.HTMLElement)) return false;
    if (node.id === FOOTER_ID || node.classList.contains('no-print')) return false;
    const style = targetDocument.defaultView.getComputedStyle(node);
    return style.display !== 'none' && style.position !== 'fixed';
  });
  let width = 0;
  let height = 0;
  for (const node of candidates) {
    width = Math.max(width, node.scrollWidth || node.getBoundingClientRect().width || 0);
    height = Math.max(height, node.scrollHeight || node.getBoundingClientRect().height || 0);
  }
  return {
    width: Math.max(width, targetDocument.body.scrollWidth || 0, targetDocument.documentElement.scrollWidth || 0),
    height: Math.max(height, targetDocument.body.scrollHeight || 0),
  };
}

function printScaleFor(size, paper) {
  if (!size.width || !size.height) return 1;
  const availableWidth = Math.max(1, paper.width - PRINT_MARGIN_X);
  const availableHeight = Math.max(1, paper.height - PRINT_MARGIN_Y);
  return Math.min(1, availableWidth / size.width, availableHeight / size.height);
}

function ensureAutoFit(targetDocument) {
  if (!targetDocument?.body || !targetDocument?.head) return;
  const size = printableDocumentSize(targetDocument);
  const portraitScale = printScaleFor(size, LETTER_PORTRAIT);
  const landscapeScale = printScaleFor(size, LETTER_LANDSCAPE);
  const useLandscape = landscapeScale > portraitScale + 0.03;
  const desiredScale = useLandscape ? landscapeScale : portraitScale;
  const scale = Math.max(MIN_READABLE_SCALE, Math.min(1, desiredScale));
  const fitsOnePage = desiredScale >= MIN_READABLE_SCALE;

  targetDocument.documentElement.dataset.bpsPrintOrientation = useLandscape ? 'landscape' : 'portrait';
  targetDocument.documentElement.dataset.bpsPrintFitsOnePage = fitsOnePage ? 'true' : 'false';
  targetDocument.documentElement.style.setProperty('--bps-global-print-scale', String(scale));

  let style = targetDocument.getElementById(AUTOFIT_STYLE_ID);
  if (!style) {
    style = targetDocument.createElement('style');
    style.id = AUTOFIT_STYLE_ID;
    targetDocument.head.appendChild(style);
  }
  const orientation = useLandscape ? 'landscape' : 'portrait';
  style.textContent = `
    @page { size: Letter ${orientation}; }
    @media print {
      html, body { max-width: none !important; }
      body {
        zoom: var(--bps-global-print-scale, 1) !important;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
    }
  `;
}

function ensureFooter(targetDocument) {
  if (!targetDocument?.body || !targetDocument?.head) return;
  // Official Virginia legal forms must print without company branding or the
  // global company/DCJS footer. Their own form content remains intact.
  if (targetDocument.body?.dataset?.noCompanyFooter === 'true' || targetDocument.documentElement?.dataset?.noCompanyFooter === 'true') return;

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
  if (!printWindow) return printWindow;

  // Never inspect or patch a cross-origin popup. Pathfinder globally wraps
  // window.open for printable reports, but Microsoft/other external auth windows
  // are also opened with window.open. Touching a custom property on those windows
  // throws a browser Same-Origin Policy error.
  try {
    if (printWindow.location?.origin && printWindow.location.origin !== window.location.origin) return printWindow;
    if (printWindow.__bpsRequiredFooterPatched) return printWindow;
    printWindow.__bpsRequiredFooterPatched = true;
  } catch {
    return printWindow;
  }

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
  window.open = (...args) => {
    const opened = nativeOpen(...args);
    const requestedUrl = String(args?.[0] || '').trim();
    if (requestedUrl) {
      try {
        const target = new URL(requestedUrl, window.location.href);
        if (target.origin !== window.location.origin) return opened;
      } catch {
        // If the target cannot be parsed, keep the browser-created window untouched.
        return opened;
      }
    }
    return patchPrintWindow(opened);
  };

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
