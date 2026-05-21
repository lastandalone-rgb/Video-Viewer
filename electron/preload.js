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
  // Helper to convert local path to media protocol url
  convertPathToMediaUrl: (absolutePath) => {
    // Vite bundles 'url' polyfill which lacks pathToFileURL, so we format it manually
    const parts = absolutePath.split(/[/\\]/);
    const encoded = parts.map(encodeURIComponent).join('/');
    // Make sure to replace %3A back to : for the drive letter on Windows
    let urlPath = encoded.replace('%3A', ':');
    if (!urlPath.startsWith('/')) {
      urlPath = '/' + urlPath;
    }
    return 'file://' + urlPath;
  },
  showContextMenu: (type, path, isFavorite) => ipcRenderer.send('show-context-menu', type, path, isFavorite),
  onContextMenuAction: (callback) => {
    ipcRenderer.removeAllListeners('context-menu-action')
    ipcRenderer.on('context-menu-action', (event, action, path, type) => callback(action, path, type))
  }
})
