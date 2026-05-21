import { app, BrowserWindow, ipcMain, dialog, protocol, net } from 'electron'
import path from 'path'
import { fileURLToPath, pathToFileURL } from 'url'
import fs from 'fs/promises'
import fsSync from 'fs'
import crypto from 'crypto'

const currentDir = typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta?.url || 'file://'))
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged

const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL

let mainWindow

// Removed custom protocol as native file:// is more reliable for streaming

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    titleBarStyle: 'hidden', // Modern look
    titleBarOverlay: {
      color: '#0f172a',
      symbolColor: '#f8fafc',
    },
    webPreferences: {
      preload: path.join(currentDir, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false, // Allow loading local file:// URLs directly
      webviewTag: true
    },
  })

  if (VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(VITE_DEV_SERVER_URL)
  } else {
    // In production, Vite builds to dist
    mainWindow.loadFile(path.join(currentDir, '../dist/index.html'))
  }
}

app.whenReady().then(() => {
  // No longer need media protocol handler, native file:// works with webSecurity: false

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// IPC Handlers
const popoutDataMap = new Map()

ipcMain.handle('open-popout-player', async (event, data) => {
  const popoutId = Date.now().toString()
  popoutDataMap.set(popoutId, data)
  
  const popoutWin = new BrowserWindow({
    width: 1000,
    height: 700,
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#0f172a',
      symbolColor: '#f8fafc',
    },
    webPreferences: {
      preload: path.join(currentDir, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false,
      webviewTag: true
    },
    alwaysOnTop: data.alwaysOnTop || false
  })

  if (VITE_DEV_SERVER_URL) {
    popoutWin.loadURL(`${VITE_DEV_SERVER_URL}?popoutId=${popoutId}`)
  } else {
    popoutWin.loadFile(path.join(currentDir, '../dist/index.html'), { search: `popoutId=${popoutId}` })
  }
  
  popoutWin.on('closed', () => {
    popoutDataMap.delete(popoutId)
  })
})

ipcMain.handle('get-popout-data', (event, popoutId) => {
  return popoutDataMap.get(popoutId)
})

ipcMain.handle('toggle-always-on-top', (event, isAlwaysOnTop) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (win) {
    win.setAlwaysOnTop(isAlwaysOnTop)
  }
})

ipcMain.on('window-move', (event, dx, dy) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (win) {
    const pos = win.getPosition()
    win.setPosition(pos[0] + dx, pos[1] + dy)
  }
})

const userDataPath = app.getPath('userData')
const dbPath = path.join(userDataPath, 'database.json')

// Cache Directories (Defaults)
const defaultThumbCacheDir = path.join(userDataPath, 'Thumbnails')
const defaultFolderCacheDir = path.join(userDataPath, 'FolderCache')

// Ensure default cache directories exist
fs.mkdir(defaultThumbCacheDir, { recursive: true }).catch(console.error)
fs.mkdir(defaultFolderCacheDir, { recursive: true }).catch(console.error)

async function readDb() {
  try {
    const data = await fs.readFile(dbPath, 'utf-8')
    const parsed = JSON.parse(data)
    if (!parsed.settings) parsed.settings = {}
    if (!parsed.favorites) parsed.favorites = []
    return parsed
  } catch (error) {
    return { folders: [], settings: {}, favorites: [] }
  }
}

async function getCacheDirs() {
  const db = await readDb()
  const customPath = db.settings?.cachePath
  if (customPath) {
    const thumbDir = path.join(customPath, 'Thumbnails')
    const folderDir = path.join(customPath, 'FolderCache')
    await fs.mkdir(thumbDir, { recursive: true }).catch(e => {})
    await fs.mkdir(folderDir, { recursive: true }).catch(e => {})
    return { thumbCacheDir: thumbDir, folderCacheDir: folderDir }
  }
  return { thumbCacheDir: defaultThumbCacheDir, folderCacheDir: defaultFolderCacheDir }
}

async function writeDb(data) {
  await fs.writeFile(dbPath, JSON.stringify(data, null, 2))
}

ipcMain.handle('get-collections', async () => {
  const db = await readDb()
  return db.folders
})

ipcMain.handle('add-collection', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
  })

  if (!result.canceled && result.filePaths.length > 0) {
    const folderPath = result.filePaths[0]
    const db = await readDb()
    
    // Check if already exists
    if (!db.folders.find((f) => f.path === folderPath)) {
      const folderName = path.basename(folderPath) || folderPath
      db.folders.push({ path: folderPath, name: folderName })
      await writeDb(db)
    }
    return db.folders
  }
  return null
})

ipcMain.handle('remove-collection', async (event, folderPath) => {
  const db = await readDb()
  db.folders = db.folders.filter(f => f.path !== folderPath)
  // Also remove from favorites if it was a folder favorite
  db.favorites = db.favorites.filter(f => f.path !== folderPath)
  await writeDb(db)
  return db.folders
})

ipcMain.handle('update-collection', async (event, folderPath, updates) => {
  const db = await readDb()
  const folder = db.folders.find(f => f.path === folderPath)
  if (folder) {
    Object.assign(folder, updates)
    await writeDb(db)
  }
  return db.folders
})

ipcMain.handle('get-favorites', async () => {
  const db = await readDb()
  return db.favorites || []
})

ipcMain.handle('add-favorite', async (event, item) => {
  const db = await readDb()
  if (!db.favorites.find((f) => f.path === item.path)) {
    db.favorites.push(item)
    await writeDb(db)
  }
  return db.favorites
})

ipcMain.handle('remove-favorite', async (event, path) => {
  const db = await readDb()
  db.favorites = db.favorites.filter(f => f.path !== path)
  await writeDb(db)
  return db.favorites
})

ipcMain.handle('process-drop', async (event, droppedPath) => {
  try {
    const stat = await fs.stat(droppedPath)
    if (stat.isDirectory()) {
      const db = await readDb()
      if (!db.folders.find((f) => f.path === droppedPath)) {
        const folderName = path.basename(droppedPath) || droppedPath
        db.folders.push({ path: droppedPath, name: folderName })
        await writeDb(db)
      }
      return { type: 'folder', collections: db.folders }
    } else if (stat.isFile()) {
      const ext = path.extname(droppedPath).toLowerCase()
      if (VIDEO_EXTENSIONS.has(ext)) {
        return { 
          type: 'video', 
          video: { name: path.basename(droppedPath), path: droppedPath, size: stat.size, date: stat.mtimeMs }
        }
      }
    }
  } catch (e) {
    console.error('Process drop failed', e)
  }
  return { type: 'unknown' }
})

// Recursive file scanner
const VIDEO_EXTENSIONS = new Set(['.mp4', '.mkv', '.webm', '.avi', '.mov'])

async function scanDirectory(dirPath) {
  let results = []
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name)
      if (entry.isDirectory()) {
        const subResults = await scanDirectory(fullPath)
        results = results.concat(subResults)
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase()
        if (VIDEO_EXTENSIONS.has(ext)) {
          try {
            const stat = await fs.stat(fullPath)
            results.push({
              name: entry.name,
              path: fullPath,
              size: stat.size,
              date: stat.mtimeMs
            })
          } catch (e) {
            console.error('Failed to stat file', fullPath, e)
          }
        }
      }
    }
  } catch (err) {
    console.error('Error scanning directory:', err)
  }
  return results
}

ipcMain.handle('scan-folder', async (event, folderPath) => {
  const videos = await scanDirectory(folderPath)
  
  // Save cache
  const { folderCacheDir } = await getCacheDirs()
  const hash = crypto.createHash('md5').update(folderPath).digest('hex')
  const cachePath = path.join(folderCacheDir, `${hash}.json`)
  await fs.writeFile(cachePath, JSON.stringify(videos)).catch(console.error)
  
  return videos
})

async function scanHierarchy(dirPath) {
  let videos = []
  let folders = []
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name)
      if (entry.isDirectory()) {
        folders.push({
          name: entry.name,
          path: fullPath
        })
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase()
        if (VIDEO_EXTENSIONS.has(ext)) {
          try {
            const stat = await fs.stat(fullPath)
            videos.push({
              name: entry.name,
              path: fullPath,
              size: stat.size,
              date: stat.mtimeMs
            })
          } catch (e) {
            console.error('Failed to stat file', fullPath, e)
          }
        }
      }
    }
  } catch (err) {
    console.error('Error scanning hierarchy:', err)
  }
  return { videos, folders }
}

ipcMain.handle('scan-hierarchy', async (event, folderPath) => {
  return await scanHierarchy(folderPath)
})

ipcMain.handle('move-file', async (event, sourcePath, targetDir) => {
  try {
    const targetPath = path.join(targetDir, path.basename(sourcePath))
    await fs.rename(sourcePath, targetPath)
    return { success: true, newPath: targetPath }
  } catch (err) {
    console.error('Failed to move file', err)
    return { success: false, error: err.message }
  }
})

ipcMain.on('show-context-menu', (event, targetType, targetPath, isFavorite) => {
  const { Menu, shell, clipboard } = require('electron')
  const template = []

  if (targetType === 'folder') {
    template.push({
      label: '在檔案總管中開啟',
      click: () => shell.openPath(targetPath)
    })
  } else if (targetType === 'video') {
    template.push({
      label: '在檔案總管中定位檔案',
      click: () => shell.showItemInFolder(targetPath)
    }, {
      label: '複製檔案路徑',
      click: () => clipboard.writeText(targetPath)
    })
  }
  
  template.push({ type: 'separator' })
  
  if (isFavorite) {
    template.push({
      label: '移除我的最愛',
      click: () => event.sender.send('context-menu-action', 'remove-favorite', targetPath)
    })
  } else {
    template.push({
      label: '加入我的最愛',
      click: () => event.sender.send('context-menu-action', 'add-favorite', targetPath, targetType)
    })
  }

  const menu = Menu.buildFromTemplate(template)
  menu.popup({ window: BrowserWindow.fromWebContents(event.sender) })
})

ipcMain.handle('get-folder-cache', async (event, folderPath) => {
  const { folderCacheDir } = await getCacheDirs()
  const hash = crypto.createHash('md5').update(folderPath).digest('hex')
  const cachePath = path.join(folderCacheDir, `${hash}.json`)
  try {
    const data = await fs.readFile(cachePath, 'utf-8')
    return JSON.parse(data)
  } catch (e) {
    return null
  }
})

ipcMain.handle('get-thumbnail', async (event, videoPath) => {
  const { thumbCacheDir } = await getCacheDirs()
  const hash = crypto.createHash('md5').update(videoPath).digest('hex')
  const thumbPath = path.join(thumbCacheDir, `${hash}.jpg`)
  try {
    await fs.access(thumbPath)
    return pathToFileURL(thumbPath).href
  } catch (e) {
    return null
  }
})

ipcMain.handle('save-thumbnail', async (event, { videoPath, base64Data }) => {
  const { thumbCacheDir } = await getCacheDirs()
  const hash = crypto.createHash('md5').update(videoPath).digest('hex')
  const thumbPath = path.join(thumbCacheDir, `${hash}.jpg`)
  
  // base64Data looks like "data:image/jpeg;base64,/9j/4AAQ..."
  const base64Image = base64Data.split(';base64,').pop()
  
  try {
    await fs.writeFile(thumbPath, base64Image, { encoding: 'base64' })
    return pathToFileURL(thumbPath).href
  } catch (e) {
    console.error('Failed to save thumbnail', e)
    return null
  }
})

// Settings IPCs
ipcMain.handle('get-settings', async () => {
  const db = await readDb()
  return db.settings
})

ipcMain.handle('save-settings', async (event, settings) => {
  const db = await readDb()
  db.settings = { ...db.settings, ...settings }
  await writeDb(db)
  return db.settings
})

ipcMain.handle('choose-directory', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory']
  })
  if (!result.canceled && result.filePaths.length > 0) {
    return result.filePaths[0]
  }
  return null
})
