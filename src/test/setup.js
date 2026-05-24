import '@testing-library/jest-dom'
import { vi } from 'vitest'

// Mock Electron API
window.electronAPI = {
  convertPathToMediaUrl: vi.fn((path) => `file://${path}`),
  getVideoDuration: vi.fn().mockResolvedValue(100),
  getSubtitles: vi.fn().mockResolvedValue([]),
  saveSettings: vi.fn().mockResolvedValue(),
  openPopoutPlayer: vi.fn(),
  getPopoutData: vi.fn(),
  toggleAlwaysOnTop: vi.fn(),
  windowMove: vi.fn(),
  showContextMenu: vi.fn(),
  onContextMenuAction: vi.fn(),
  scanHierarchyAll: vi.fn(),
  batchRenameExt: vi.fn(),
  extractArchive: vi.fn(),
  onExtractProgress: vi.fn()
}

// Mock HTMLMediaElement methods
window.HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue()
window.HTMLMediaElement.prototype.pause = vi.fn()
window.HTMLMediaElement.prototype.load = vi.fn()

// Mock document methods for fullscreen
document.exitFullscreen = vi.fn().mockResolvedValue()
document.documentElement.requestFullscreen = vi.fn().mockResolvedValue()
