import { app, BrowserWindow, ipcMain, dialog, protocol, net } from 'electron'
import path from 'path'
import { fileURLToPath, pathToFileURL } from 'url'
import fs from 'fs/promises'
import fsSync from 'fs'
import crypto from 'crypto'
import { spawn, execSync } from 'child_process'

// Detect if ffmpeg is available on the system
function findFfmpeg() {
  const candidates = [
    '/opt/homebrew/bin/ffmpeg',   // Apple Silicon Homebrew
    '/usr/local/bin/ffmpeg',      // Intel Homebrew
    '/usr/bin/ffmpeg',            // System
  ]
  for (const p of candidates) {
    if (fsSync.existsSync(p)) return p
  }
  try {
    const result = execSync('which ffmpeg', { encoding: 'utf8' }).trim()
    if (result) return result
  } catch (_) {}
  return null
}

const FFMPEG_PATH = findFfmpeg()
console.log('[Video-Viewer] ffmpeg path:', FFMPEG_PATH || 'not found')

function findFfprobe() {
  const candidates = [
    '/opt/homebrew/bin/ffprobe',
    '/usr/local/bin/ffprobe',
    '/usr/bin/ffprobe',
  ]
  for (const p of candidates) {
    if (fsSync.existsSync(p)) return p
  }
  try {
    const result = execSync('which ffprobe', { encoding: 'utf8' }).trim()
    if (result) return result
  } catch (_) {}
  return null
}
const FFPROBE_PATH = findFfprobe()
console.log('[Video-Viewer] ffprobe path:', FFPROBE_PATH || 'not found')

async function checkNeedsTranscode(filePath, ext) {
  if (!FFMPEG_PATH || !FFPROBE_PATH) return false
  if (!['.mkv', '.avi', '.flv', '.mov'].includes(ext)) return false
  
  return new Promise((resolve) => {
    const probe = spawn(FFPROBE_PATH, [
      '-v', 'error',
      '-select_streams', 'a:0',
      '-show_entries', 'stream=codec_name',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      filePath
    ])
    
    let out = ''
    probe.stdout.on('data', d => out += d.toString())
    probe.on('close', () => {
      const codec = out.trim().toLowerCase()
      console.log(`[Video-Viewer] Audio codec for ${path.basename(filePath)}: ${codec || 'unknown'}`)
      
      const supported = ['aac', 'mp3', 'vorbis', 'opus', 'flac']
      if (codec && !supported.includes(codec)) {
        resolve(true)
      } else {
        resolve(false)
      }
    })
    probe.on('error', () => resolve(false))
  })
}

const currentDir = typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta?.url || 'file://'))
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged

const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL

let mainWindow

// Removed custom protocol as native file:// is more reliable for streaming

function createWindow() {
  const isMac = process.platform === 'darwin'

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    // macOS: use 'hiddenInset' to show traffic lights inside the window
    // Windows: use 'hidden' with titleBarOverlay for custom chrome buttons
    titleBarStyle: isMac ? 'hiddenInset' : 'hidden',
    ...(isMac ? {} : {
      titleBarOverlay: {
        color: '#0f172a',
        symbolColor: '#f8fafc',
      }
    }),
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

protocol.registerSchemesAsPrivileged([
  { scheme: 'media', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, bypassCSP: true } }
])

app.whenReady().then(() => {
  // Register custom media:// protocol for MKV/AC3 transcoding on macOS
  protocol.handle('media', async (request) => {
    const url = new URL(request.url)
    // Decode the file path from media://localhost/<encoded-path>
    let filePath = decodeURIComponent(url.pathname)
    // On Windows: /C:/path -> C:/path
    if (/^\/[A-Za-z]:/.test(filePath)) filePath = filePath.slice(1)

    const ext = path.extname(filePath).toLowerCase()
    const needsTranscode = await checkNeedsTranscode(filePath, ext)

    if (needsTranscode) {
      // Stream via ffmpeg: copy video, transcode audio to AAC inside fragmented MP4
      let ff = null
      return new Response(
        new ReadableStream({
          start(controller) {
            let closed = false

            const cleanup = () => {
              if (!closed) {
                closed = true
                try { controller.close() } catch (_) {}
              }
              if (ff && !ff.killed) {
                ff.stdout.destroy()
                ff.kill('SIGKILL')
              }
            }

            const seekParam = url.searchParams.get('seek')
            const ffmpegArgs = []
            if (seekParam && parseFloat(seekParam) > 0) {
              ffmpegArgs.push('-ss', parseFloat(seekParam).toString())
            }
            ffmpegArgs.push(
              '-i', filePath,
              '-c:v', 'copy',          // copy video stream as-is
              '-c:a', 'aac',           // transcode audio to AAC
              '-b:a', '192k',
              '-f', 'matroska',        // output MKV container
              'pipe:1'
            )

            ff = spawn(FFMPEG_PATH, ffmpegArgs, { stdio: ['ignore', 'pipe', 'ignore'] })

            ff.stdout.on('data', (chunk) => {
              if (!closed) {
                try { controller.enqueue(chunk) } catch (_) { cleanup() }
              }
            })
            ff.stdout.on('end', () => cleanup())
            ff.stdout.on('error', () => cleanup())
            ff.on('error', () => cleanup())
            ff.on('close', () => cleanup())
          },
          cancel() {
            // Called when the browser cancels the request (e.g. video src changes)
            if (ff && !ff.killed) {
              ff.stdout.destroy()
              ff.kill('SIGKILL')
            }
          }
        }),
        { headers: { 'Content-Type': 'video/x-matroska' } }
      )
    }


    // Fallback: serve file directly via net.fetch
    return net.fetch(pathToFileURL(filePath).href, {
      headers: request.headers,
      method: request.method,
    })
  })

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
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
    ...(process.platform === 'darwin' ? {} : {
      titleBarOverlay: {
        color: '#0f172a',
        symbolColor: '#f8fafc',
      }
    }),
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

ipcMain.handle('get-video-duration', async (event, filePath) => {
  if (!FFPROBE_PATH) return null
  return new Promise((resolve) => {
    const probe = spawn(FFPROBE_PATH, [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      filePath
    ])
    let out = ''
    probe.stdout.on('data', d => out += d.toString())
    probe.on('close', () => {
      const duration = parseFloat(out.trim())
      resolve(isNaN(duration) ? null : duration)
    })
    probe.on('error', () => resolve(null))
  })
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
          video: { name: path.basename(droppedPath), path: droppedPath, size: stat.size, date: stat.mtimeMs, type: 'video' }
        }
      } else if (IMAGE_EXTENSIONS.has(ext)) {
        return { 
          type: 'image', 
          video: { name: path.basename(droppedPath), path: droppedPath, size: stat.size, date: stat.mtimeMs, type: 'image' }
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
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg'])

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
        if (VIDEO_EXTENSIONS.has(ext) || IMAGE_EXTENSIONS.has(ext)) {
          try {
            const stat = await fs.stat(fullPath)
            results.push({
              name: entry.name,
              path: fullPath,
              size: stat.size,
              date: stat.mtimeMs,
              type: VIDEO_EXTENSIONS.has(ext) ? 'video' : 'image'
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
        if (VIDEO_EXTENSIONS.has(ext) || IMAGE_EXTENSIONS.has(ext)) {
          try {
            const stat = await fs.stat(fullPath)
            videos.push({
              name: entry.name,
              path: fullPath,
              size: stat.size,
              date: stat.mtimeMs,
              type: VIDEO_EXTENSIONS.has(ext) ? 'video' : 'image'
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
  const isMac = process.platform === 'darwin'
  const template = []

  if (targetType === 'folder') {
    template.push({
      label: isMac ? '在 Finder 中開啟' : '在檔案總管中開啟',
      click: () => shell.openPath(targetPath)
    })
  } else if (targetType === 'video') {
    template.push({
      label: isMac ? '在 Finder 中定位檔案' : '在檔案總管中定位檔案',
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

// ── Subtitle IPC ──────────────────────────────────────────────────────────────

const subtitleCacheDir = path.join(userDataPath, 'SubtitleCache')
fs.mkdir(subtitleCacheDir, { recursive: true }).catch(console.error)

/**
 * Convert SRT content string to WebVTT string.
 * Pure Node.js – no dependencies required.
 */
function srtToVtt(srt) {
  const header = 'WEBVTT\n\n'
  const body = srt
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    // Replace SRT timestamps  00:00:00,000 --> 00:00:00,000
    //   with VTT timestamps   00:00:00.000 --> 00:00:00.000
    .replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2')
  return header + body
}

/**
 * Very basic ASS/SSA → VTT converter: strips formatting tags, keeps dialogue timing.
 */
function assToVtt(ass) {
  const lines = ass.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
  let vtt = 'WEBVTT\n\n'
  let index = 1
  for (const line of lines) {
    if (!line.startsWith('Dialogue:')) continue
    // Format: Dialogue: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
    const parts = line.split(',')
    if (parts.length < 10) continue
    const startRaw = parts[1].trim()  // H:MM:SS.cc
    const endRaw   = parts[2].trim()
    const text = parts.slice(9).join(',')
      .replace(/\{[^}]*\}/g, '')       // strip {tags}
      .replace(/\\N/g, '\n')           // line break
      .trim()
    if (!text) continue

    const toVttTime = (t) => {
      // H:MM:SS.cc → HH:MM:SS.ccc
      const [h, m, sc] = t.split(':')
      const [s, cs] = (sc || '0.0').split('.')
      const ms = (parseInt(cs || 0) * 10).toString().padStart(3, '0')
      return `${h.padStart(2,'0')}:${m.padStart(2,'0')}:${s.padStart(2,'0')}.${ms}`
    }

    vtt += `${index++}\n${toVttTime(startRaw)} --> ${toVttTime(endRaw)}\n${text}\n\n`
  }
  return vtt
}

ipcMain.handle('get-subtitles', async (event, videoPath) => {
  const dir  = path.dirname(videoPath)
  const base = path.basename(videoPath, path.extname(videoPath))

  const candidates = [
    { ext: '.vtt', convert: null },
    { ext: '.srt', convert: srtToVtt },
    { ext: '.ass', convert: assToVtt },
    { ext: '.ssa', convert: assToVtt },
  ]

  for (const { ext, convert } of candidates) {
    const subPath = path.join(dir, base + ext)
    try {
      await fs.access(subPath)

      if (!convert) {
        // Native VTT – serve directly
        return { url: pathToFileURL(subPath).href, found: true }
      }

      // Convert and cache
      const hash     = crypto.createHash('md5').update(subPath).digest('hex')
      const cachePath = path.join(subtitleCacheDir, `${hash}.vtt`)

      // Use cache if it exists and is newer than the source
      let useCache = false
      try {
        const [cacheStat, srcStat] = await Promise.all([
          fs.stat(cachePath),
          fs.stat(subPath)
        ])
        useCache = cacheStat.mtimeMs >= srcStat.mtimeMs
      } catch (_) {}

      if (!useCache) {
        const raw = await fs.readFile(subPath, 'utf-8')
        await fs.writeFile(cachePath, convert(raw), 'utf-8')
      }

      return { url: pathToFileURL(cachePath).href, found: true }
    } catch (_) {
      // file not found – try next
    }
  }

  return { found: false }
})

// ── File-Type Aware Hierarchy Scanner ────────────────────────────────────────

const ALL_FILE_CATEGORIES = {
  video:   new Set(['.mp4', '.mkv', '.webm', '.avi', '.mov', '.flv', '.wmv', '.m4v']),
  audio:   new Set(['.mp3', '.aac', '.flac', '.wav', '.ogg', '.m4a', '.opus']),
  image:   new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg', '.tiff']),
  archive: new Set(['.zip', '.rar', '.7z', '.tar', '.gz', '.bz2', '.xz', '.zst']),
  doc:     new Set(['.pdf', '.txt', '.docx', '.doc', '.xlsx', '.pptx', '.md']),
}

function getFileCategory(ext) {
  for (const [cat, exts] of Object.entries(ALL_FILE_CATEGORIES)) {
    if (exts.has(ext)) return cat
  }
  return 'other'
}

ipcMain.handle('scan-hierarchy-all', async (event, dirPath) => {
  let videos = [], folders = [], others = []
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name)
      if (entry.isDirectory()) {
        folders.push({ name: entry.name, path: fullPath })
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase()
        try {
          const stat = await fs.stat(fullPath)
          const info = { name: entry.name, path: fullPath, size: stat.size, date: stat.mtimeMs, ext, category: getFileCategory(ext) }
          if (VIDEO_EXTENSIONS.has(ext)) {
            videos.push(info)
          } else {
            others.push(info)
          }
        } catch (e) {}
      }
    }
  } catch (err) {
    console.error('scan-hierarchy-all error:', err)
  }
  return { videos, folders, others }
})

// ── Batch Rename Extension ────────────────────────────────────────────────────

ipcMain.handle('batch-rename-ext', async (event, filePaths, newExt) => {
  // Ensure newExt starts with a dot
  if (!newExt.startsWith('.')) newExt = '.' + newExt
  const results = []
  for (const filePath of filePaths) {
    const dir = path.dirname(filePath)
    const base = path.basename(filePath, path.extname(filePath))
    const newPath = path.join(dir, base + newExt)
    try {
      await fs.rename(filePath, newPath)
      results.push({ success: true, from: filePath, to: newPath })
    } catch (err) {
      console.error('batch-rename-ext failed:', filePath, err.message)
      results.push({ success: false, from: filePath, error: err.message })
    }
  }
  return results
})

// ── Extract Archive via Bandizip ──────────────────────────────────────────────

const BZ_PATH = 'C:\\Program Files\\Bandizip\\bz.exe'

ipcMain.handle('extract-archive', async (event, archivePaths, mode, password) => {
  // Returns immediately; progress is pushed via 'extract-progress' events
  const id = Date.now().toString()

  const sendProgress = (archive, data) => {
    try { event.sender.send('extract-progress', { id, archive, ...data }) } catch (_) {}
  }

  setImmediate(async () => {
    for (const archivePath of archivePaths) {
      const dir  = path.dirname(archivePath)
      const base = path.basename(archivePath, path.extname(archivePath))
      const targetDir = mode === 'subfolder' ? path.join(dir, base) : dir

      sendProgress(archivePath, { targetDir, extracted: 0, total: 0, percent: 0, current: '準備中…', done: false, error: null })

      try {
        await fs.mkdir(targetDir, { recursive: true })

        // ── Step 1: count total files via `bz l` ──────────────────────────
        const total = await new Promise((resolve) => {
          const lproc = spawn(BZ_PATH, ['l', archivePath], { stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true })
          let out = ''
          lproc.stdout.on('data', d => out += d.toString())
          lproc.on('close', () => {
            // Each file entry line starts with a date: 2023-01-01 ...
            const count = out.split('\n').filter(l => /^\d{4}[-\/]\d{2}[-\/]\d{2}/.test(l.trim())).length
            resolve(count || 0)
          })
          lproc.on('error', () => resolve(0))
        })

        sendProgress(archivePath, { targetDir, extracted: 0, total, percent: 0, current: '開始解壓縮…', done: false, error: null })

        // ── Step 2: extract with progress ─────────────────────────────────
        let extracted = 0
        let exitCode  = 0
        let stderrText = ''

        const args = ['x', '-aoa', `-o:${targetDir}`]
        if (password) args.push(`-p:${password}`)
        args.push(archivePath)

        await new Promise((resolve) => {
          const proc = spawn(BZ_PATH, args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
          proc.stderr.on('data', d => stderrText += d.toString())
          proc.stdout.on('data', (chunk) => {
            const lines = chunk.toString().split(/\r?\n/)
            for (const line of lines) {
              const trimmed = line.trim()
              if (!trimmed) continue
              extracted++
              const percent = total > 0 ? Math.min(99, Math.round((extracted / total) * 100)) : -1
              sendProgress(archivePath, { targetDir, extracted, total, percent, current: trimmed, done: false, error: null })
            }
          })
          proc.on('close', code => { exitCode = code; resolve() })
          proc.on('error', () => { exitCode = -1; resolve() })
        })

        // ── Step 3: report result ──────────────────────────────────────────
        let error = null
        if (exitCode !== 0) {
          const combined = (stderrText + '').toLowerCase()
          error = (combined.includes('password') || combined.includes('wrong')) ? 'wrong_password' : 'extract_failed'
        }
        sendProgress(archivePath, { targetDir, extracted, total, percent: exitCode === 0 ? 100 : -1, current: '', done: true, error })

      } catch (err) {
        console.error('extract-archive failed:', archivePath, err.message)
        sendProgress(archivePath, { targetDir, extracted: 0, total: 0, percent: -1, current: '', done: true, error: err.message })
      }
    }
  })

  return { started: true, id }
})
