import '@testing-library/jest-dom'

// Mock Electron API globally
window.electronAPI = {
  getCollections: vi.fn().mockResolvedValue([]),
  addCollection: vi.fn().mockResolvedValue([]),
  removeCollection: vi.fn().mockResolvedValue([]),
  updateCollection: vi.fn().mockResolvedValue([]),
  getFavorites: vi.fn().mockResolvedValue([]),
  addFavorite: vi.fn().mockResolvedValue([]),
  removeFavorite: vi.fn().mockResolvedValue([]),
  scanFolder: vi.fn().mockResolvedValue([]),
  scanHierarchy: vi.fn().mockResolvedValue({ videos: [], folders: [] }),
  moveFile: vi.fn().mockResolvedValue({ success: true, newPath: '' }),
  getFolderCache: vi.fn().mockResolvedValue(null),
  getThumbnail: vi.fn().mockResolvedValue(null),
  saveThumbnail: vi.fn().mockResolvedValue(null),
  showContextMenu: vi.fn(),
  processDrop: vi.fn().mockResolvedValue({ type: 'unknown' }),
  getSettings: vi.fn().mockResolvedValue({}),
  saveSettings: vi.fn().mockResolvedValue({}),
  chooseDirectory: vi.fn().mockResolvedValue(null),
  openPopoutPlayer: vi.fn().mockResolvedValue(null),
  getPopoutData: vi.fn().mockResolvedValue(null),
  toggleAlwaysOnTop: vi.fn().mockResolvedValue(null),
  windowMove: vi.fn(),
  getVideoDuration: vi.fn().mockResolvedValue(null),
  getSubtitles: vi.fn().mockResolvedValue({ found: false }),
  onContextMenuAction: vi.fn(),
  convertPathToMediaUrl: vi.fn((p) => `file:///${p.replace(/\\/g, '/')}`),
}

// Mock requestFullscreen
Object.defineProperty(document.documentElement, 'requestFullscreen', {
  value: vi.fn().mockResolvedValue(undefined),
  writable: true,
})
Object.defineProperty(document, 'exitFullscreen', {
  value: vi.fn().mockResolvedValue(undefined),
  writable: true,
})

// Mock HTMLMediaElement playback methods (jsdom doesn't support them)
Object.defineProperty(window.HTMLMediaElement.prototype, 'play', {
  value: vi.fn().mockResolvedValue(undefined),
  writable: true,
})
Object.defineProperty(window.HTMLMediaElement.prototype, 'pause', {
  value: vi.fn(),
  writable: true,
})
Object.defineProperty(window.HTMLMediaElement.prototype, 'load', {
  value: vi.fn(),
  writable: true,
})
