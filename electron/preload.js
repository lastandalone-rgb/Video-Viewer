const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  getCollections: () => ipcRenderer.invoke('get-collections'),
  addCollection: () => ipcRenderer.invoke('add-collection'),
  removeCollection: (path) => ipcRenderer.invoke('remove-collection', path),
  updateCollection: (path, updates) => ipcRenderer.invoke('update-collection', path, updates),
  getFavorites: () => ipcRenderer.invoke('get-favorites'),
  addFavorite: (item) => ipcRenderer.invoke('add-favorite', item),
  removeFavorite: (path) => ipcRenderer.invoke('remove-favorite', path),
  scanFolder: (path) => ipcRenderer.invoke('scan-folder', path),
  scanHierarchy: (path) => ipcRenderer.invoke('scan-hierarchy', path),
  moveFile: (source, targetDir) => ipcRenderer.invoke('move-file', source, targetDir),
  getFolderCache: (path) => ipcRenderer.invoke('get-folder-cache', path),
  getThumbnail: (path) => ipcRenderer.invoke('get-thumbnail', path),
  saveThumbnail: (videoPath, base64Data) => ipcRenderer.invoke('save-thumbnail', { videoPath, base64Data }),
  showContextMenu: (targetType, targetPath) => ipcRenderer.send('show-context-menu', targetType, targetPath),
  processDrop: (path) => ipcRenderer.invoke('process-drop', path),
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),
  chooseDirectory: () => ipcRenderer.invoke('choose-directory'),
  openPopoutPlayer: (data) => ipcRenderer.invoke('open-popout-player', data),
  getPopoutData: (id) => ipcRenderer.invoke('get-popout-data', id),
  toggleAlwaysOnTop: (isTop) => ipcRenderer.invoke('toggle-always-on-top', isTop),
  windowMove: (dx, dy) => ipcRenderer.send('window-move', dx, dy),
  getSubtitles: (videoPath) => ipcRenderer.invoke('get-subtitles', videoPath),
  // Helper to convert local path to file:// or media:// URL (cross-platform)
  convertPathToMediaUrl: (absolutePath) => {
    // Split on both forward and back slashes to handle Windows & macOS
    const parts = absolutePath.split(/[/\\]/);
    const encoded = parts.map(encodeURIComponent).join('/');
    // On Windows paths look like "C:\..." which becomes "C%3A/..." after split+encode;
    // restore the colon so the URL is "file:///C:/..."
    // On macOS paths start with "/" so parts[0] is empty, giving "/Users/..." — correct.
    let urlPath = encoded.replace('%3A', ':');
    if (!urlPath.startsWith('/')) {
      urlPath = '/' + urlPath;
    }
    // Use custom media:// protocol for MKV/AVI/MOV/FLV so ffmpeg can transcode audio on-the-fly
    const ext = absolutePath.split('.').pop().toLowerCase();
    if (['mkv', 'avi', 'flv'].includes(ext)) {
      return 'media://localhost' + urlPath;
    }
    return 'file://' + urlPath;
  },
  showContextMenu: (targetType, targetPath, isFavorite) => ipcRenderer.send('show-context-menu', targetType, targetPath, isFavorite),
  onContextMenuAction: (callback) => {
    ipcRenderer.removeAllListeners('context-menu-action')
    ipcRenderer.on('context-menu-action', (event, action, path, type) => callback(action, path, type))
  },
  getVideoDuration: (filePath) => ipcRenderer.invoke('get-video-duration', filePath),
  scanHierarchyAll: (path) => ipcRenderer.invoke('scan-hierarchy-all', path),
  batchRenameExt: (filePaths, newExt) => ipcRenderer.invoke('batch-rename-ext', filePaths, newExt),
  extractArchive: (archivePaths, mode, password) => ipcRenderer.invoke('extract-archive', archivePaths, mode, password),
  onExtractProgress: (callback) => {
    ipcRenderer.removeAllListeners('extract-progress')
    ipcRenderer.on('extract-progress', (e, data) => callback(data))
  },
})
