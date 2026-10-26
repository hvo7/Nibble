// Exercise Tesseract's Electron-specific environment branch in real Node workers.
// This is a compatibility regression, not a substitute for launching Electron.
Object.defineProperty(process.versions, 'electron', { value: '41.10.7', configurable: true });
