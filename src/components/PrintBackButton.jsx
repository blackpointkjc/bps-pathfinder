// This is a utility component definition for print windows
// Include this snippet in any print HTML that needs a back button

export const getPrintBackButtonCSS = () => `
  .back-button {
    position: fixed;
    top: 10px;
    left: 10px;
    padding: 10px 20px;
    background: #1e40af;
    color: white;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    font-size: 14px;
    font-weight: 600;
    box-shadow: 0 2px 4px rgba(0,0,0,0.2);
    z-index: 9999;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .back-button:hover { background: #1e3a8a; }
  .back-button:active { background: #1e3a8a; transform: scale(0.98); }
`;

export const getPrintBackButtonHTML = () => `
  <button class="back-button no-print" onclick="window.close()">
    ← Back to App
  </button>
`;

export default { getPrintBackButtonCSS, getPrintBackButtonHTML };