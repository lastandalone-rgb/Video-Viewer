import React, { useState, useEffect, useRef } from 'react'
import { Folder, FolderPlus, Trash2, PlayCircle, ArrowLeft, LayoutGrid, List, AlignJustify, MonitorPlay, ChevronDown, ChevronUp, Home, Settings, HardDrive, Menu, Heart, Globe, FolderTree, ArrowUp, ArrowRight, RotateCcw, Bookmark, ExternalLink, Filter, X, Archive, Film, Music, Image, FileText, File } from 'lucide-react'
import VideoPlayer from './components/VideoPlayer'
import Thumbnail from './components/Thumbnail'
import Pagination from './components/Pagination'

const folderCache = new Map()

function CollectionCard({ folder, onClick, onRemove, onContextMenu, onDragOver, onDrop }) {
  const [stats, setStats] = useState(null)
  const [isDragOver, setIsDragOver] = useState(false)
  
  useEffect(() => {
    if (window.electronAPI) {
      window.electronAPI.getFolderCache(folder.path).then(cache => {
        if (cache && cache.length > 0) {
          setStats({ count: cache.length, firstVideo: cache[0].path })
        }
      })
    }
  }, [folder.path])

  return (
    <div 
      className={`collection-card ${isDragOver ? 'drag-over' : ''}`} 
      onClick={onClick} 
      onContextMenu={onContextMenu}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragOver(true);
        if (onDragOver) onDragOver(e);
      }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={(e) => {
        setIsDragOver(false);
        if (onDrop) onDrop(e);
      }}
    >
      {stats && stats.firstVideo ? (
        <div className="collection-cover">
          <Thumbnail videoPath={stats.firstVideo} />
          <div className="collection-overlay"></div>
        </div>
      ) : (
        <div className="collection-cover empty">
          <Folder size={48} opacity={0.5} />
        </div>
      )}
      <div className="collection-info">
        <h3 title={folder.name}>{folder.name}</h3>
        <p>{stats ? `${stats.count} 部影片` : '未掃描或無影片'}</p>
      </div>
      {onRemove && <button className="remove-btn" onClick={onRemove} title="移除"><Trash2 size={16} /></button>}
    </div>
  )
}

function ExtractDialog({ archivePaths, defaultMode, onConfirm, onCancel }) {
  const [mode, setMode] = useState(defaultMode || 'subfolder')
  const [password, setPassword] = useState('')
  const [showPwd, setShowPwd] = useState(false)
  const names = archivePaths.map(p => p.split(/[/\\]/).pop())
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="rename-dialog" style={{ width: 420 }} onClick={e => e.stopPropagation()}>
        <h3>📦 解壓縮設定</h3>
        <p style={{ marginBottom: 12 }}>
          {names.length === 1 ? names[0] : `${names.length} 個壓縮檔`}
        </p>

        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: 8 }}>解壓縮模式</div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginBottom: 8, color: 'white', fontSize: '0.9rem' }}>
            <input type="radio" name="exmode" value="here" checked={mode === 'here'} onChange={() => setMode('here')} style={{ accentColor: 'var(--accent-color)' }} />
            解壓縮到此處
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', color: 'white', fontSize: '0.9rem' }}>
            <input type="radio" name="exmode" value="subfolder" checked={mode === 'subfolder'} onChange={() => setMode('subfolder')} style={{ accentColor: 'var(--accent-color)' }} />
            解壓縮到各別獨立資料夾
          </label>
        </div>

        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: 6 }}>壓縮檔密碼（選填）</div>
          <div style={{ position: 'relative' }}>
            <input
              className="ext-input"
              type={showPwd ? 'text' : 'password'}
              placeholder="無密碼請留空"
              value={password}
              onChange={e => setPassword(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') onConfirm(mode, password || undefined) }}
              style={{ paddingRight: 40, marginBottom: 0 }}
              autoFocus
            />
            <button
              onClick={() => setShowPwd(s => !s)}
              style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '1rem' }}
            >{showPwd ? '🙈' : '👁️'}</button>
          </div>
        </div>

        <div className="dialog-actions">
          <button className="btn" onClick={onCancel}>取消</button>
          <button className="btn primary" onClick={() => onConfirm(mode, password || undefined)}>開始解壓縮</button>
        </div>
      </div>
    </div>
  )
}

export default function App() {
  const [currentPage, setCurrentPage] = useState('home') // 'home' | 'settings'
  const [isSidebarOpen, setIsSidebarOpen] = useState(true)
  const [collections, setCollections] = useState([])
  const [currentFolder, setCurrentFolder] = useState(null)
  const [currentSubFolderPath, setCurrentSubFolderPath] = useState(null)
  const [subfolders, setSubfolders] = useState([])
  const [videos, setVideos] = useState([])
  const [playingIndex, setPlayingIndex] = useState(-1)
  const [isLoading, setIsLoading] = useState(false)
  const [viewMode, setViewMode] = useState('grid')
  const [toast, setToast] = useState(null)
  
  const [sortConfig, setSortConfig] = useState({ key: 'name', direction: 'asc' })
  const [settings, setSettings] = useState({ defaultViewMode: 'grid', cachePath: '', playbackBehavior: 'inline', defaultAlwaysOnTop: false, gridItemsPerPage: 48, browserUrl: 'https://www.google.com', shortcuts: { prev: 'a', next: 'c' } })
  const [currentPageIndex, setCurrentPageIndex] = useState(0)
  
  const [favorites, setFavorites] = useState([])
  
  // Popout mode state
  const [isPopoutMode, setIsPopoutMode] = useState(false)
  const [popoutData, setPopoutData] = useState(null)

  // Hierarchy all-files mode state
  const [allFiles, setAllFiles] = useState([])          // { videos, folders, others }
  const [fileTypeFilter, setFileTypeFilter] = useState(new Set(['video'])) // active categories
  const [showFilterPanel, setShowFilterPanel] = useState(false)
  const [selectedFiles, setSelectedFiles] = useState(new Set())  // Set of file paths
  const [selectionBox, setSelectionBox] = useState(null)         // { startX, startY, endX, endY }
  const [selectionOrigin, setSelectionOrigin] = useState(null)
  const [showRenameDialog, setShowRenameDialog] = useState(false)
  const [newExtInput, setNewExtInput] = useState('')
  const [extracting, setExtracting] = useState(false)
  const fileCardRefs = useRef({})    // path -> DOM ref for intersection detection
  const fileGridRef = useRef(null)
  const isDraggingRef = useRef(false) // true while rubber-band drag is active
  const [hierarchyCtxMenu, setHierarchyCtxMenu] = useState(null) // { x, y, file }

  // Extract progress state (non-blocking)
  const [extractQueue, setExtractQueue] = useState([])  // [{ id, archive, percent, current, done, error, targetDir }]
  const [extractDialog, setExtractDialog] = useState(null) // { archivePaths, mode } — for password input

  // Browser state
  const webviewRef = useRef(null)
  const [browserInputUrl, setBrowserInputUrl] = useState(settings.browserUrl)
  const [currentBrowserUrl, setCurrentBrowserUrl] = useState(settings.browserUrl)

  useEffect(() => {
    setBrowserInputUrl(settings.browserUrl)
    setCurrentBrowserUrl(settings.browserUrl)
  }, [settings.browserUrl])

  useEffect(() => {
    const webview = webviewRef.current
    if (webview) {
      const handleDidNavigate = (e) => {
        setBrowserInputUrl(e.url)
        setCurrentBrowserUrl(e.url)
      }
      webview.addEventListener('did-navigate', handleDidNavigate)
      webview.addEventListener('did-navigate-in-page', handleDidNavigate)
      return () => {
        webview.removeEventListener('did-navigate', handleDidNavigate)
        webview.removeEventListener('did-navigate-in-page', handleDidNavigate)
      }
    }
  }, [webviewRef.current])

  const handleBrowserNav = (action) => {
    const wv = webviewRef.current
    if (!wv) return
    if (action === 'back' && wv.canGoBack()) wv.goBack()
    if (action === 'forward' && wv.canGoForward()) wv.goForward()
    if (action === 'reload') wv.reload()
  }

  const handleBrowserGo = (e) => {
    e.preventDefault()
    let url = browserInputUrl
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'https://' + url
    }
    setBrowserInputUrl(url)
    if (webviewRef.current) {
      webviewRef.current.loadURL(url)
    }
  }

  const handleAddBookmark = async () => {
    if (window.electronAPI) {
      const item = { type: 'bookmark', path: currentBrowserUrl, name: currentBrowserUrl, dateAdded: Date.now() }
      const newFavs = await window.electronAPI.addFavorite(item)
      setFavorites(newFavs)
      setToast({ message: '已加入書籤', originalPath: '', newPath: '' })
      setTimeout(() => setToast(null), 3000)
    }
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const popoutId = params.get('popoutId')
    
    if (popoutId && window.electronAPI) {
      setIsPopoutMode(true)
      window.electronAPI.getPopoutData(popoutId).then(data => {
        if (data) {
          setPopoutData(data)
        }
      })
    } else {
      loadCollections()
      loadSettings()
    }
  }, [])

  useEffect(() => {
    // Global drag and drop setup
    const handleDrop = async (e) => {
      e.preventDefault()
      if (!window.electronAPI) return
      const files = Array.from(e.dataTransfer.files)
      if (files.length === 0) return
      
      const filePath = files[0].path
      if (!filePath) return
      
      const result = await window.electronAPI.processDrop(filePath)
      
      if (result.type === 'folder') {
        setCollections(result.collections)
        setCurrentPage('home')
      } else if (result.type === 'video') {
        setVideos([result.video])
        setPlayingIndex(0)
        setCurrentFolder(null)
        setCurrentPage('home')
      }
    }

    const handleDragOver = (e) => {
      e.preventDefault()
    }

    window.addEventListener('dragover', handleDragOver)
    window.addEventListener('drop', handleDrop)

    return () => {
      window.removeEventListener('dragover', handleDragOver)
      window.removeEventListener('drop', handleDrop)
    }
  }, [])

  useEffect(() => {
    if (window.electronAPI) {
      window.electronAPI.onContextMenuAction((action, path, type) => {
        if (action === 'add-favorite') {
          // If we are currently viewing a folder, we need to find the item
          let item = null
          if (type === 'folder') {
            item = collections.find(c => c.path === path)
          } else {
            // Find video from current videos array
            item = videos.find(v => v.path === path)
          }
          if (item) {
            window.electronAPI.addFavorite({ type, ...item }).then(setFavorites)
          }
        } else if (action === 'remove-favorite') {
          window.electronAPI.removeFavorite(path).then(setFavorites)
        }
      })
    }
  }, [collections, videos])

  useEffect(() => {
    if (viewMode === 'theatre' && playingIndex === -1 && videos.length > 0) {
      setPlayingIndex(0)
    }
  }, [viewMode, playingIndex, videos])

  const loadSettings = async () => {
    if (window.electronAPI) {
      const dbSettings = await window.electronAPI.getSettings()
      if (dbSettings) {
        setSettings({ defaultViewMode: 'grid', cachePath: '', browserUrl: 'https://www.google.com', ...dbSettings })
        setViewMode(dbSettings.defaultViewMode || 'grid')
      }
    }
  }

  const saveSettings = async (newSettings) => {
    const updated = { ...settings, ...newSettings }
    setSettings(updated)
    if (window.electronAPI) {
      await window.electronAPI.saveSettings(updated)
    }
  }

  const handleChangeCachePath = async () => {
    if (window.electronAPI) {
      const path = await window.electronAPI.chooseDirectory()
      if (path) {
        saveSettings({ cachePath: path })
      }
    }
  }

  const loadCollections = async () => {
    if (window.electronAPI) {
      const data = await window.electronAPI.getCollections()
      setCollections(data)
      const favs = await window.electronAPI.getFavorites()
      setFavorites(favs || [])
    }
  }

  const handleAddCollection = async () => {
    if (window.electronAPI) {
      const data = await window.electronAPI.addCollection()
      if (data) setCollections(data)
    }
  }

  const handleRemoveCollection = async (e, path) => {
    e.stopPropagation()
    if (window.electronAPI) {
      const data = await window.electronAPI.removeCollection(path)
      setCollections(data)
    }
  }

  const handleOpenFolder = async (folder, subPath = null) => {
    setCurrentFolder(folder)
    const targetPath = subPath || folder.path
    setCurrentSubFolderPath(targetPath)
    setViewMode(settings.defaultViewMode || 'grid')
    setPlayingIndex(-1)
    setCurrentPageIndex(0)
    setSelectedFiles(new Set())
    
    setIsLoading(true)
    if (window.electronAPI) {
      if (folder.mode === 'hierarchy') {
        // Always use scanHierarchyAll in hierarchy mode to support file type filter
        const data = await window.electronAPI.scanHierarchyAll(targetPath)
        setVideos(data.videos)
        setSubfolders(data.folders)
        setAllFiles(data)
      } else {
        setSubfolders([])
        setAllFiles({})
        if (folderCache.has(targetPath)) {
          setVideos(folderCache.get(targetPath))
          window.electronAPI.scanFolder(targetPath).then(scannedVideos => {
            folderCache.set(targetPath, scannedVideos)
            setVideos(scannedVideos)
          })
        } else {
          const diskCache = await window.electronAPI.getFolderCache(targetPath)
          if (diskCache) {
            setVideos(diskCache)
            folderCache.set(targetPath, diskCache)
            window.electronAPI.scanFolder(targetPath).then(scannedVideos => {
              folderCache.set(targetPath, scannedVideos)
              setVideos(scannedVideos)
            })
          } else {
            const scannedVideos = await window.electronAPI.scanFolder(targetPath)
            folderCache.set(targetPath, scannedVideos)
            setVideos(scannedVideos)
          }
        }
      }
    }
    setIsLoading(false)
  }

  // ── Computed filtered file list for hierarchy all-files mode ────────────────
  const filteredAllFiles = React.useMemo(() => {
    if (!allFiles.videos) return []
    const showAll = fileTypeFilter.has('all')
    let result = []
    if (showAll || fileTypeFilter.has('video')) result = result.concat(allFiles.videos || [])
    if ((showAll || fileTypeFilter.has('audio')) && allFiles.others) 
      result = result.concat(allFiles.others.filter(f => f.category === 'audio'))
    if ((showAll || fileTypeFilter.has('image')) && allFiles.others)
      result = result.concat(allFiles.others.filter(f => f.category === 'image'))
    if ((showAll || fileTypeFilter.has('archive')) && allFiles.others)
      result = result.concat(allFiles.others.filter(f => f.category === 'archive'))
    if ((showAll || fileTypeFilter.has('doc')) && allFiles.others)
      result = result.concat(allFiles.others.filter(f => f.category === 'doc'))
    if (fileTypeFilter.has('other') && allFiles.others)
      result = result.concat(allFiles.others.filter(f => f.category === 'other'))
    return result.sort((a, b) => a.name.localeCompare(b.name))
  }, [allFiles, fileTypeFilter])

  const toggleFileTypeFilter = (cat) => {
    setFileTypeFilter(prev => {
      const next = new Set(prev)
      if (cat === 'all') {
        return next.has('all') ? new Set(['video']) : new Set(['all'])
      }
      next.delete('all')
      if (next.has(cat)) { next.delete(cat); if (next.size === 0) next.add('video') }
      else next.add(cat)
      return next
    })
  }

  // ── Rubber-band selection (works from anywhere in grid) ───────────────────
  const DRAG_THRESHOLD = 6

  const handleGridMouseDown = (e) => {
    if (e.button !== 0) return
    isDraggingRef.current = false
    setSelectionOrigin({ x: e.clientX, y: e.clientY, ctrl: e.ctrlKey || e.metaKey })
  }

  const handleGridMouseMove = (e) => {
    if (!selectionOrigin) return
    const dx = e.clientX - selectionOrigin.x
    const dy = e.clientY - selectionOrigin.y
    if (!isDraggingRef.current && Math.sqrt(dx * dx + dy * dy) < DRAG_THRESHOLD) return

    // Activate rubber-band on first move past threshold
    if (!isDraggingRef.current) {
      isDraggingRef.current = true
      if (!selectionOrigin.ctrl) setSelectedFiles(new Set())
    }

    const x = Math.min(e.clientX, selectionOrigin.x)
    const y = Math.min(e.clientY, selectionOrigin.y)
    const w = Math.abs(dx)
    const h = Math.abs(dy)
    setSelectionBox({ x, y, w, h })

    // Hit-test all file cards
    const newSel = new Set()
    for (const [fpath, el] of Object.entries(fileCardRefs.current)) {
      if (!el) continue
      const rect = el.getBoundingClientRect()
      if (rect.left < x + w && rect.right > x && rect.top < y + h && rect.bottom > y) {
        newSel.add(fpath)
      }
    }
    if (!selectionOrigin.ctrl) {
      setSelectedFiles(newSel)
    } else {
      setSelectedFiles(prev => { const n = new Set(prev); newSel.forEach(p => n.add(p)); return n })
    }
  }

  const handleGridMouseUp = () => {
    setSelectionOrigin(null)
    setSelectionBox(null)
    // isDraggingRef.current stays true until next mousedown (suppresses card onClick)
  }

  const toggleSelectFile = (e, fpath) => {
    e.stopPropagation()
    setSelectedFiles(prev => {
      const next = new Set(prev)
      if (e.ctrlKey || e.metaKey) {
        if (next.has(fpath)) next.delete(fpath)
        else next.add(fpath)
      } else {
        if (next.has(fpath) && next.size === 1) next.clear()
        else { next.clear(); next.add(fpath) }
      }
      return next
    })
  }

  // ── Batch rename extension ──────────────────────────────────────────────────
  const handleBatchRenameExt = async () => {
    if (!window.electronAPI || selectedFiles.size === 0) return
    let ext = newExtInput.trim()
    if (!ext) return
    if (!ext.startsWith('.')) ext = '.' + ext
    const results = await window.electronAPI.batchRenameExt([...selectedFiles], ext)
    const succeeded = results.filter(r => r.success).length
    setShowRenameDialog(false)
    setNewExtInput('')
    setSelectedFiles(new Set())
    // Refresh
    if (currentFolder) handleOpenFolder(currentFolder, currentSubFolderPath)
    setToast({ message: `已重新命名 ${succeeded} 個檔案`, originalPath: '', newPath: '' })
    setTimeout(() => setToast(null), 4000)
  }

  // ── Extract archive (non-blocking, shows progress panel) ───────────────────
  const startExtract = (archivePaths, mode, password) => {
    if (!window.electronAPI || archivePaths.length === 0) return
    window.electronAPI.extractArchive(archivePaths, mode, password)
    // Progress events handled in useEffect below
  }

  const handleExtractArchive = (mode, paths) => {
    const archivePaths = paths || [...selectedFiles].filter(isArchive)
    if (archivePaths.length === 0) return
    // Show password dialog before extracting
    setExtractDialog({ archivePaths, mode })
  }

  // Listen to progress events from main process
  useEffect(() => {
    if (!window.electronAPI?.onExtractProgress) return
    window.electronAPI.onExtractProgress((data) => {
      setExtractQueue(prev => {
        const idx = prev.findIndex(q => q.id === data.id && q.archive === data.archive)
        const entry = { id: data.id, archive: data.archive, targetDir: data.targetDir,
          percent: data.percent, current: data.current, total: data.total, extracted: data.extracted,
          done: data.done, error: data.error }
        if (idx >= 0) {
          const next = [...prev]; next[idx] = entry; return next
        }
        return [...prev, entry]
      })
      // Auto-refresh directory when an archive finishes successfully
      if (data.done && !data.error && currentFolder) {
        handleOpenFolder(currentFolder, currentSubFolderPath)
      }
      // Auto-dismiss done items after 5s
      if (data.done) {
        setTimeout(() => {
          setExtractQueue(prev => prev.filter(q => !(q.id === data.id && q.archive === data.archive && q.done)))
        }, 5000)
      }
    })
  }, [currentFolder, currentSubFolderPath])

  // Esc key to clear selection
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') setSelectedFiles(new Set()) }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const CATEGORY_LABELS = {
    video: { label: '影片', icon: <Film size={14} />, color: '#60a5fa' },
    audio: { label: '音訊', icon: <Music size={14} />, color: '#c084fc' },
    image: { label: '圖片', icon: <Image size={14} />, color: '#4ade80' },
    archive: { label: '壓縮檔', icon: <Archive size={14} />, color: '#fbbf24' },
    doc: { label: '文件', icon: <FileText size={14} />, color: '#fb923c' },
    other: { label: '其他', icon: <File size={14} />, color: '#94a3b8' },
  }

  const ARCHIVE_EXTS = new Set(['.zip','.rar','.7z','.tar','.gz','.bz2','.xz','.zst'])

  const isArchive = (p) => ARCHIVE_EXTS.has(('.' + p.split('.').pop()).toLowerCase())

  const openHierarchyCtxMenu = (e, file) => {
    e.preventDefault()
    e.stopPropagation()
    // If right-clicking a file not in selection, make it the sole selection
    if (!selectedFiles.has(file.path)) {
      setSelectedFiles(new Set([file.path]))
    }
    setHierarchyCtxMenu({ x: e.clientX, y: e.clientY, file })
  }

  const closeHierarchyCtxMenu = () => setHierarchyCtxMenu(null)

  const handleToggleMode = async () => {
    if (!currentFolder || !window.electronAPI) return
    const newMode = currentFolder.mode === 'hierarchy' ? 'flat' : 'hierarchy'
    const updatedCollections = await window.electronAPI.updateCollection(currentFolder.path, { mode: newMode })
    setCollections(updatedCollections)
    
    // Refresh current view
    const updatedFolder = updatedCollections.find(f => f.path === currentFolder.path)
    if (updatedFolder) {
      handleOpenFolder(updatedFolder)
    }
  }

  const handleDragStart = (e, videoPath) => {
    e.dataTransfer.setData('video-path', videoPath)
  }

  const handleDropToFolder = async (e, targetFolder) => {
    e.preventDefault()
    const videoPath = e.dataTransfer.getData('video-path')
    if (videoPath && window.electronAPI) {
      const result = await window.electronAPI.moveFile(videoPath, targetFolder.path)
      if (result.success) {
        // Refresh
        handleOpenFolder(currentFolder, currentSubFolderPath)
        setToast({
          message: `已搬移檔案至 ${targetFolder.name}`,
          originalPath: videoPath,
          newPath: result.newPath
        })
        setTimeout(() => setToast(null), 10000)
      }
    }
  }

  const handleUndoMove = async () => {
    if (!toast || !window.electronAPI) return
    // Extract the original directory path
    const originalDir = toast.originalPath.substring(0, Math.max(toast.originalPath.lastIndexOf('\\'), toast.originalPath.lastIndexOf('/')))
    const result = await window.electronAPI.moveFile(toast.newPath, originalDir)
    if (result.success) {
      handleOpenFolder(currentFolder, currentSubFolderPath)
      setToast(null)
    }
  }

  const handleDragOverFolder = (e) => {
    e.preventDefault()
  }

  const handleContextMenu = (e, type, path) => {
    e.preventDefault()
    e.stopPropagation()
    if (window.electronAPI && window.electronAPI.showContextMenu) {
      const isFavorite = favorites.some(f => f.path === path)
      window.electronAPI.showContextMenu(type, path, isFavorite)
    }
  }

  const sortedVideos = React.useMemo(() => {
    let sortable = [...videos]
    sortable.sort((a, b) => {
      let aVal = a[sortConfig.key] || (sortConfig.key === 'name' ? '' : 0)
      let bVal = b[sortConfig.key] || (sortConfig.key === 'name' ? '' : 0)
      
      if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1
      if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1
      return 0
    })
    return sortable
  }, [videos, sortConfig])

  const requestSort = (key) => {
    let direction = 'asc'
    if (sortConfig.key === key && sortConfig.direction === 'asc') direction = 'desc'
    setSortConfig({ key, direction })
    setCurrentPageIndex(0)
  }

  const handleRibbonWheel = (e) => {
    if (e.deltaY !== 0) {
      e.currentTarget.scrollLeft += e.deltaY
    }
  }

  const currentDataSource = currentFolder?.mode === 'hierarchy' ? filteredAllFiles : sortedVideos;
  
  const paginatedItems = React.useMemo(() => {
    if (!settings.gridItemsPerPage || settings.gridItemsPerPage === 'all') {
      return currentDataSource
    }
    const start = currentPageIndex * settings.gridItemsPerPage
    return currentDataSource.slice(start, start + settings.gridItemsPerPage)
  }, [currentDataSource, viewMode, settings.gridItemsPerPage, currentPageIndex])

  const totalPages = settings.gridItemsPerPage && settings.gridItemsPerPage !== 'all'
    ? Math.ceil(currentDataSource.length / settings.gridItemsPerPage)
    : 1

  const formatSize = (bytes) => {
    if (!bytes) return '--'
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  }

  const formatDate = (ms) => {
    if (!ms) return '--'
    return new Date(ms).toLocaleDateString()
  }

  const SortIcon = ({ columnKey }) => {
    if (sortConfig.key !== columnKey) return null
    return sortConfig.direction === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />
  }

  const handleNext = (shouldLoopPlaylist = false) => {
    if (sortedVideos.length === 0) return
    let nextIndex = playingIndex + 1
    if (nextIndex >= sortedVideos.length) {
      if (shouldLoopPlaylist) nextIndex = 0
      else { setPlayingIndex(-1); return }
    }
    setPlayingIndex(nextIndex)
  }

  const handlePrev = () => {
    if (sortedVideos.length === 0) return
    let prevIndex = playingIndex - 1
    if (prevIndex < 0) prevIndex = sortedVideos.length - 1
    setPlayingIndex(prevIndex)
  }

  const handlePlayVideo = (index) => {
    if (settings.playbackBehavior === 'popout' && viewMode !== 'theatre') {
      if (window.electronAPI) {
        window.electronAPI.openPopoutPlayer({
          playingIndex: index,
          playlist: sortedVideos.length > 0 ? sortedVideos : videos,
          alwaysOnTop: settings.defaultAlwaysOnTop
        })
      }
    } else {
      setPlayingIndex(index)
    }
  }

  const isPlayingFullscreen = playingIndex !== -1 && viewMode !== 'theatre'

  if (isPopoutMode) {
    if (!popoutData) return <div style={{ color: 'white', padding: 20 }}>載入中...</div>
    
    const { playingIndex: pIndex, playlist, alwaysOnTop } = popoutData
    return (
      <div style={{ width: '100vw', height: '100vh', background: 'black' }}>
        <VideoPlayer 
          video={playlist[pIndex]} 
          playlist={playlist}
          onClose={() => window.close()}
          onNext={() => {
            let nextIndex = pIndex + 1
            if (nextIndex >= playlist.length) nextIndex = 0
            setPopoutData({ ...popoutData, playingIndex: nextIndex })
          }}
          onPrev={() => {
            let prevIndex = pIndex - 1
            if (prevIndex < 0) prevIndex = playlist.length - 1
            setPopoutData({ ...popoutData, playingIndex: prevIndex })
          }}
          isPopout={true}
          initialAlwaysOnTop={alwaysOnTop}
          settings={settings}
        />
      </div>
    )
  }

  return (
    <div className="app-layout">
      <aside className={`sidebar no-drag ${!isSidebarOpen ? 'collapsed' : ''}`}>
        <div className="sidebar-logo">
          <button className="icon-btn no-drag" onClick={() => setIsSidebarOpen(!isSidebarOpen)} style={{ background: 'transparent', border: 'none', color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Menu size={24} />
          </button>
          {isSidebarOpen && <span>Video Viewer</span>}
        </div>
        <nav className="sidebar-nav">
          <button 
            className={`nav-item ${currentPage === 'home' && !currentFolder ? 'active' : ''}`}
            onClick={() => { setCurrentPage('home'); setCurrentFolder(null); setPlayingIndex(-1); }}
            title="影音資料庫"
          >
            <Home size={20} style={{ minWidth: 20 }} />
            {isSidebarOpen && <span>影音資料庫</span>}
          </button>
          
          {currentFolder && (
            <button 
              className={`nav-item ${currentPage === 'home' ? 'active' : ''}`} 
              style={{ paddingLeft: '32px' }} 
              title={currentFolder.name}
              onClick={() => { setCurrentPage('home'); setPlayingIndex(-1); }}
            >
              <Folder size={16} style={{ minWidth: 16 }} />
              {isSidebarOpen && <span>{currentFolder.name}</span>}
            </button>
          )}
          
          <button 
            className={`nav-item ${currentPage === 'favorites' ? 'active' : ''}`}
            onClick={() => { setCurrentPage('favorites'); setPlayingIndex(-1); }}
            title="我的最愛"
          >
            <Heart size={20} style={{ minWidth: 20 }} />
            {isSidebarOpen && <span>我的最愛</span>}
          </button>
          
          <button 
            className={`nav-item ${currentPage === 'browser' ? 'active' : ''}`}
            onClick={() => { setCurrentPage('browser'); setPlayingIndex(-1); }}
            title="瀏覽器"
          >
            <Globe size={20} style={{ minWidth: 20 }} />
            {isSidebarOpen && <span>瀏覽器</span>}
          </button>

          <button 
            className={`nav-item ${currentPage === 'settings' ? 'active' : ''}`}
            onClick={() => { setCurrentPage('settings'); setPlayingIndex(-1); }}
            title="設定中心"
          >
            <Settings size={20} style={{ minWidth: 20 }} />
            {isSidebarOpen && <span>設定中心</span>}
          </button>
        </nav>
      </aside>

      <main className="main-content">
        {isPlayingFullscreen && (
          <VideoPlayer 
            video={sortedVideos[playingIndex] || videos[playingIndex]} 
            playlist={sortedVideos.length > 0 ? sortedVideos : videos}
            onClose={() => setPlayingIndex(-1)}
            onNext={handleNext}
            onPrev={handlePrev}
            settings={settings}
          />
        )}

        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          
          <div style={{ display: currentPage === 'settings' ? 'flex' : 'none', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
            <div className="settings-page scrollable" style={{ height: '100%' }}>
              <header className="header">
                <h1>設定中心</h1>
              </header>
              <div className="settings-content">
                <div className="settings-section card">
                  <h3>預設視圖模式</h3>
                  <p className="settings-desc">進入資料夾時預設使用的顯示方式</p>
                  <div className="view-toggles" style={{ marginTop: '16px', background: 'rgba(0,0,0,0.2)' }}>
                    <button className={`view-btn ${settings.defaultViewMode === 'grid' ? 'active' : ''}`} onClick={() => saveSettings({ defaultViewMode: 'grid' })}><LayoutGrid size={18} /> 網格</button>
                    <button className={`view-btn ${settings.defaultViewMode === 'list' ? 'active' : ''}`} onClick={() => saveSettings({ defaultViewMode: 'list' })}><List size={18} /> 條列</button>
                    <button className={`view-btn ${settings.defaultViewMode === 'compact' ? 'active' : ''}`} onClick={() => saveSettings({ defaultViewMode: 'compact' })}><AlignJustify size={18} /> 清單</button>
                    <button className={`view-btn ${settings.defaultViewMode === 'theatre' ? 'active' : ''}`} onClick={() => saveSettings({ defaultViewMode: 'theatre' })}><MonitorPlay size={18} /> 劇場</button>
                  </div>
                </div>

                <div className="settings-section card" style={{ marginTop: '24px' }}>
                  <h3>播放行為模式</h3>
                  <p className="settings-desc">點擊影片時的預設播放方式</p>
                  <div className="view-toggles" style={{ marginTop: '16px', background: 'rgba(0,0,0,0.2)' }}>
                    <button className={`view-btn ${settings.playbackBehavior === 'inline' || !settings.playbackBehavior ? 'active' : ''}`} onClick={() => saveSettings({ playbackBehavior: 'inline' })}>視窗內播放 (預設)</button>
                    <button className={`view-btn ${settings.playbackBehavior === 'popout' ? 'active' : ''}`} onClick={() => saveSettings({ playbackBehavior: 'popout' })}>彈出獨立視窗</button>
                  </div>
                  {settings.playbackBehavior === 'popout' && (
                    <div style={{ marginTop: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <input 
                        type="checkbox" 
                        id="alwaysOnTop" 
                        checked={settings.defaultAlwaysOnTop || false}
                        onChange={(e) => saveSettings({ defaultAlwaysOnTop: e.target.checked })}
                      />
                      <label htmlFor="alwaysOnTop" style={{ cursor: 'pointer' }}>彈出視窗預設為「永遠置頂」</label>
                    </div>
                  )}
                </div>

                <div className="settings-section card" style={{ marginTop: '24px' }}>
                  <h3>網格模式分頁數量</h3>
                  <p className="settings-desc">設定網格模式下每頁載入的影片數量，減少卡頓</p>
                  <div className="view-toggles" style={{ marginTop: '16px', background: 'rgba(0,0,0,0.2)', flexWrap: 'wrap' }}>
                    <button className={`view-btn ${settings.gridItemsPerPage === 8 ? 'active' : ''}`} onClick={() => saveSettings({ gridItemsPerPage: 8 })}>8 筆</button>
                    <button className={`view-btn ${settings.gridItemsPerPage === 16 ? 'active' : ''}`} onClick={() => saveSettings({ gridItemsPerPage: 16 })}>16 筆</button>
                    <button className={`view-btn ${settings.gridItemsPerPage === 24 ? 'active' : ''}`} onClick={() => saveSettings({ gridItemsPerPage: 24 })}>24 筆</button>
                    <button className={`view-btn ${settings.gridItemsPerPage === 48 || (!settings.gridItemsPerPage && settings.gridItemsPerPage !== 'all') ? 'active' : ''}`} onClick={() => saveSettings({ gridItemsPerPage: 48 })}>48 筆</button>
                    <button className={`view-btn ${settings.gridItemsPerPage === 96 ? 'active' : ''}`} onClick={() => saveSettings({ gridItemsPerPage: 96 })}>96 筆</button>
                    <button className={`view-btn ${settings.gridItemsPerPage === 'all' ? 'active' : ''}`} onClick={() => saveSettings({ gridItemsPerPage: 'all' })}>全部載入</button>
                    <div style={{ display: 'flex', alignItems: 'center', marginLeft: '8px', padding: '4px' }}>
                      <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginRight: '8px' }}>自訂:</span>
                      <input 
                        type="number" 
                        min="1"
                        style={{ width: '70px', padding: '4px 8px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(0,0,0,0.3)', color: 'white', outline: 'none' }}
                        value={![8, 16, 24, 48, 96, 'all'].includes(settings.gridItemsPerPage) ? (settings.gridItemsPerPage || '') : ''}
                        placeholder="數量"
                        onChange={(e) => {
                          const val = parseInt(e.target.value);
                          if (!isNaN(val) && val > 0) saveSettings({ gridItemsPerPage: val });
                        }}
                      />
                    </div>
                  </div>
                </div>

                <div className="settings-section card" style={{ marginTop: '24px' }}>
                  <h3>快取與縮圖存放路徑</h3>
                  <p className="settings-desc">變更應用程式產生之縮圖檔與資料夾快取的儲存位置（適用於節省 C 槽空間）</p>
                  <div className="path-display">
                    <HardDrive size={18} opacity={0.7} />
                    <span style={{ flex: 1, fontFamily: 'monospace', fontSize: '0.9rem', color: '#94a3b8' }}>
                      {settings.cachePath || '系統預設路徑 (AppData)'}
                    </span>
                    <button className="btn primary" onClick={handleChangeCachePath}>更改路徑</button>
                  </div>
                </div>

                <div className="settings-section card" style={{ marginTop: '24px' }}>
                  <h3>內建瀏覽器首頁</h3>
                  <p className="settings-desc">設定點擊「瀏覽器」時預設載入的網址</p>
                  <div style={{ marginTop: '16px', display: 'flex', gap: '8px' }}>
                    <input 
                      type="text" 
                      style={{ flex: 1, padding: '8px 12px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.2)', color: 'white' }}
                      value={settings.browserUrl || ''}
                      onChange={(e) => saveSettings({ browserUrl: e.target.value })}
                      placeholder="例如: https://www.google.com"
                    />
                  </div>
                </div>

                <div className="settings-section card" style={{ marginTop: '24px' }}>
                  <h3>快捷鍵設定 (播放器)</h3>
                  <p className="settings-desc">設定在播放影片時，用來切換上一部與下一部影片的快捷鍵 (點擊輸入框後按下欲設定的按鍵)。</p>
                  <div style={{ marginTop: '16px', display: 'flex', gap: '16px' }}>
                    <div>
                      <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>上一部影片</label>
                      <input 
                        type="text" 
                        style={{ width: '120px', padding: '8px 12px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.2)', color: 'white', textAlign: 'center', cursor: 'pointer' }}
                        value={settings.shortcuts?.prev || 'a'}
                        readOnly
                        onKeyDown={(e) => {
                          e.preventDefault()
                          saveSettings({ shortcuts: { ...settings.shortcuts, prev: e.key } })
                        }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>下一部影片</label>
                      <input 
                        type="text" 
                        style={{ width: '120px', padding: '8px 12px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.2)', color: 'white', textAlign: 'center', cursor: 'pointer' }}
                        value={settings.shortcuts?.next || 'c'}
                        readOnly
                        onKeyDown={(e) => {
                          e.preventDefault()
                          saveSettings({ shortcuts: { ...settings.shortcuts, next: e.key } })
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div style={{ display: currentPage === 'home' && currentFolder ? 'flex' : 'none', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
              <header className="header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <button className="btn" onClick={() => setCurrentFolder(null)}>
                    <ArrowLeft size={18} /> 返回
                  </button>
                  <h1 style={{ fontSize: '1.2rem', margin: 0, color: 'white', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {currentFolder?.name}
                    {currentFolder?.mode === 'hierarchy' && currentSubFolderPath !== currentFolder.path && (
                      <>
                        <span style={{ color: '#64748b' }}>/</span>
                        <span style={{ fontSize: '1rem', color: '#94a3b8' }}>
                          {currentSubFolderPath.replace(currentFolder.path, '').replace(/^[/\\]/, '')}
                        </span>
                        <button className="btn" style={{ marginLeft: '8px', padding: '4px 8px' }} onClick={() => {
                          const parts = currentSubFolderPath.split(/[/\\]/);
                          parts.pop();
                          handleOpenFolder(currentFolder, parts.join('/'))
                        }}>
                          <ArrowUp size={16} /> 上一層
                        </button>
                      </>
                    )}
                  </h1>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                  <div className="view-toggles no-drag" style={{ background: 'var(--bg-card)' }}>
                    <button className={`view-btn ${currentFolder?.mode !== 'hierarchy' ? 'active' : ''}`} onClick={handleToggleMode} title="扁平模式">扁平</button>
                    <button className={`view-btn ${currentFolder?.mode === 'hierarchy' ? 'active' : ''}`} onClick={handleToggleMode} title="樹狀模式">
                      <FolderTree size={16} style={{ marginRight: 4 }}/> 樹狀
                    </button>
                  </div>

                  {currentFolder?.mode === 'hierarchy' && (
                    <div className="filter-panel-wrapper no-drag">
                      <button 
                        className={`filter-toggle-btn ${fileTypeFilter.has('all') || fileTypeFilter.size > 1 || !fileTypeFilter.has('video') ? 'active' : ''}`}
                        onClick={() => setShowFilterPanel(p => !p)}
                      >
                        <Filter size={14} /> 篩選類型
                        {(fileTypeFilter.has('all') ? '全部' : [...fileTypeFilter].map(c => CATEGORY_LABELS[c]?.label).join(', '))}
                      </button>
                      {showFilterPanel && (
                        <div className="filter-panel no-drag">
                          <label><input type="checkbox" checked={fileTypeFilter.has('all')} onChange={() => toggleFileTypeFilter('all')} /> 全部檔案</label>
                          <div className="filter-divider" />
                          {Object.entries(CATEGORY_LABELS).map(([cat, { label, icon, color }]) => (
                            <label key={cat}>
                              <input type="checkbox" checked={fileTypeFilter.has('all') || fileTypeFilter.has(cat)} onChange={() => toggleFileTypeFilter(cat)} />
                              <span style={{ color }}>{icon}</span> {label}
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  <div className="view-toggles no-drag">
                      <button className={`view-btn ${viewMode === 'grid' ? 'active' : ''}`} onClick={() => { setViewMode('grid'); setPlayingIndex(-1) }} title="網格"><LayoutGrid size={18} /></button>
                      <button className={`view-btn ${viewMode === 'list' ? 'active' : ''}`} onClick={() => { setViewMode('list'); setPlayingIndex(-1) }} title="條列"><List size={18} /></button>
                      <button className={`view-btn ${viewMode === 'compact' ? 'active' : ''}`} onClick={() => { setViewMode('compact'); setPlayingIndex(-1) }} title="清單"><AlignJustify size={18} /></button>
                      <button className={`view-btn ${viewMode === 'theatre' ? 'active' : ''}`} onClick={() => setViewMode('theatre')} title="劇場"><MonitorPlay size={18} /></button>
                    </div>

                  {selectedFiles.size > 0 && (
                    <div className="selection-badge no-drag">
                      已選 {selectedFiles.size} 個
                      <button className="clear-btn" onClick={() => setSelectedFiles(new Set())}><X size={12} /></button>
                    </div>
                  )}

                  <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                    {currentFolder?.mode === 'hierarchy' ? `${filteredAllFiles.length} 個檔案` : `${sortedVideos.length} 部影片`}
                  </div>
                </div>
              </header>
              
              {viewMode === 'theatre' ? (
                <div className="theatre-layout">
                  <div className="theatre-player-wrapper">
                    {playingIndex !== -1 && sortedVideos[playingIndex] ? (
                      <VideoPlayer 
                        video={sortedVideos[playingIndex]} 
                        playlist={sortedVideos}
                        onClose={() => { setViewMode('grid'); setPlayingIndex(-1) }}
                        onNext={handleNext}
                        onPrev={handlePrev}
                        settings={settings}
                        isEmbedded={true}
                      />
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#666' }}>無影片可播放</div>
                    )}
                  </div>
                  <div className="theatre-playlist-ribbon scrollable-x no-drag" onWheel={handleRibbonWheel}>
                    {sortedVideos.map((vid, index) => (
                      <div 
                        key={vid.path} 
                        className={`ribbon-card ${playingIndex === index ? 'active' : ''}`} 
                        onClick={() => setPlayingIndex(index)}
                        onContextMenu={(e) => handleContextMenu(e, 'video', vid.path)}
                      >
                        <Thumbnail videoPath={vid.path} />
                        <p title={vid.name}>{vid.name}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <main className="scrollable">
                  {isLoading ? (
                    <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>掃描影片中...</div>
                  ) : (
                    viewMode === 'compact' ? (
                      <div className="data-table-container">
                        {currentFolder?.mode === 'hierarchy' && subfolders.length > 0 && currentPageIndex === 0 && (
                          <div style={{ marginBottom: '16px' }}>
                            <h3 style={{ fontSize: '1rem', color: '#94a3b8', marginBottom: '8px' }}>子資料夾</h3>
                            <div className="collection-grid">
                              {subfolders.map(sf => (
                                <CollectionCard 
                                  key={sf.path} folder={sf} 
                                  onClick={() => handleOpenFolder(currentFolder, sf.path)} 
                                  onDrop={(e) => handleDropToFolder(e, sf)}
                                />
                              ))}
                            </div>
                          </div>
                        )}
                        <table className="data-table">
                          <thead>
                            <tr>
                              <th onClick={() => requestSort('name')}>檔案名稱 <SortIcon columnKey="name" /></th>
                              <th onClick={() => requestSort('date')}>建立日期 <SortIcon columnKey="date" /></th>
                              <th onClick={() => requestSort('size')}>大小 <SortIcon columnKey="size" /></th>
                            </tr>
                          </thead>
                          <tbody>
                            {paginatedItems.map((file, index) => {
                              const isVideo = currentFolder?.mode === 'hierarchy' ? (file.category === 'video') : true;
                              const actualIndex = (settings.gridItemsPerPage && settings.gridItemsPerPage !== 'all') 
                                ? (currentPageIndex * settings.gridItemsPerPage) + index : index;
                              
                              return (
                                <tr 
                                  key={file.path}
                                  onClick={(e) => {
                                    if (currentFolder?.mode === 'hierarchy') {
                                      if (e.ctrlKey || e.metaKey) { toggleSelectFile(e, file.path); return }
                                    }
                                    if (isVideo) {
                                      const sourceArray = currentFolder?.mode === 'hierarchy' ? (allFiles.videos || []) : sortedVideos;
                                      const vi = sourceArray.findIndex(v => v.path === file.path);
                                      if (vi !== -1) handlePlayVideo(vi);
                                    }
                                  }}
                                  onContextMenu={(e) => currentFolder?.mode === 'hierarchy' ? openHierarchyCtxMenu(e, file) : handleContextMenu(e, 'video', file.path)}
                                  style={{ background: selectedFiles.has(file.path) ? 'rgba(59, 130, 246, 0.2)' : '' }}
                                >
                                  <td>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                      {isVideo ? <PlayCircle size={16} style={{ color: 'var(--accent-color)' }} /> : <File size={16} style={{ color: '#94a3b8' }} />}
                                      {file.name}
                                    </div>
                                  </td>
                                  <td>{formatDate(file.date)}</td>
                                  <td>{formatSize(file.size)}</td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div
                        ref={currentFolder?.mode === 'hierarchy' ? fileGridRef : null}
                        style={{ padding: '16px', userSelect: currentFolder?.mode === 'hierarchy' ? 'none' : 'auto' }}
                        onMouseDown={currentFolder?.mode === 'hierarchy' ? handleGridMouseDown : undefined}
                        onMouseMove={currentFolder?.mode === 'hierarchy' ? handleGridMouseMove : undefined}
                        onMouseUp={currentFolder?.mode === 'hierarchy' ? handleGridMouseUp : undefined}
                      >
                        {currentFolder?.mode === 'hierarchy' && subfolders.length > 0 && currentPageIndex === 0 && (
                          <div style={{ marginBottom: '24px' }}>
                            <h3 style={{ fontSize: '1rem', color: '#94a3b8', marginBottom: '12px' }}>子資料夾</h3>
                            <div className="collection-grid">
                              {subfolders.map(sf => (
                                <CollectionCard key={sf.path} folder={sf}
                                  onClick={() => handleOpenFolder(currentFolder, sf.path)}
                                  onDrop={(e) => handleDropToFolder(e, sf)}
                                />
                              ))}
                            </div>
                          </div>
                        )}
                        
                        {paginatedItems.length > 0 && (
                          <div className={viewMode === 'list' ? 'list-view' : 'grid'} style={currentFolder?.mode === 'hierarchy' && viewMode === 'grid' ? { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '10px' } : {}}>
                            {paginatedItems.map((file, index) => {
                              const isSelected = selectedFiles.has(file.path);
                              const isVideo = currentFolder?.mode === 'hierarchy' ? (file.category === 'video') : true;
                              const actualIndex = (settings.gridItemsPerPage && settings.gridItemsPerPage !== 'all') 
                                ? (currentPageIndex * settings.gridItemsPerPage) + index : index;

                              if (isVideo) {
                                return (
                                  <div
                                    key={file.path}
                                    ref={el => { if (currentFolder?.mode === 'hierarchy') fileCardRefs.current[file.path] = el }}
                                    className={`card ${isSelected ? 'selected' : ''}`}
                                    style={{ cursor: 'pointer', outline: isSelected ? '2px solid var(--accent-color)' : 'none', outlineOffset: '2px' }}
                                    onClick={(e) => {
                                      if (currentFolder?.mode === 'hierarchy') {
                                        if (isDraggingRef.current) return;
                                        if (e.ctrlKey || e.metaKey) { toggleSelectFile(e, file.path); return }
                                        const vi = (allFiles.videos || []).findIndex(v => v.path === file.path);
                                        if (vi !== -1) handlePlayVideo(vi);
                                      } else {
                                        handlePlayVideo(actualIndex);
                                      }
                                    }}
                                    onContextMenu={(e) => currentFolder?.mode === 'hierarchy' ? openHierarchyCtxMenu(e, file) : handleContextMenu(e, 'video', file.path)}
                                    draggable="true"
                                    onDragStart={(e) => handleDragStart(e, file.path)}
                                  >
                                    <Thumbnail videoPath={file.path} />
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                      <PlayCircle size={18} className="icon" />
                                      <h3 title={file.name} style={currentFolder?.mode === 'hierarchy' ? { fontSize: '0.82rem' } : {}}>{file.name}</h3>
                                    </div>
                                    {isSelected && <div style={{ position: 'absolute', top: 6, right: 6, background: 'var(--accent-color)', borderRadius: '50%', width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', color: 'white' }}>✓</div>}
                                  </div>
                                )
                              } else {
                                const extLabel = file.ext?.replace('.','').toUpperCase() || '';
                                return (
                                  <div
                                    key={file.path}
                                    ref={el => { if (currentFolder?.mode === 'hierarchy') fileCardRefs.current[file.path] = el }}
                                    className={`file-card ${isSelected ? 'selected' : ''}`}
                                    onClick={(e) => { if (isDraggingRef.current) return; toggleSelectFile(e, file.path) }}
                                    onContextMenu={(e) => openHierarchyCtxMenu(e, file)}
                                  >
                                    <div className={`file-icon cat-${file.category || 'other'}`}>{extLabel}</div>
                                    <div className="file-info">
                                      <div className="file-name" title={file.name}>{file.name}</div>
                                      <div className="file-meta">{formatSize(file.size)} &middot; {formatDate(file.date)}</div>
                                    </div>
                                    {isSelected && <div style={{ color: 'var(--accent-color)', flexShrink: 0 }}>✓</div>}
                                  </div>
                                )
                              }
                            })}
                          </div>
                        )}
                        {paginatedItems.length === 0 && subfolders.length === 0 && (
                          <div className="empty-state"><File size={48} opacity={0.3} /><p>此資料夾沒有符合篩選條件的檔案</p></div>
                        )}
                      </div>
                    )
                  )}
                  
                  {totalPages > 1 && (
                    <Pagination 
                      totalPages={totalPages} 
                      currentPageIndex={currentPageIndex} 
                      setCurrentPageIndex={setCurrentPageIndex} 
                    />
                  )}
                </main>
              )}
          </div>

          {/* ── Batch Rename Extension Dialog ── */}
          {showRenameDialog && (
            <div className="modal-backdrop" onClick={() => setShowRenameDialog(false)}>
              <div className="rename-dialog" onClick={e => e.stopPropagation()}>
                <h3>批量重命名副檔名</h3>
                <p>已選取 {selectedFiles.size} 個檔案，請輸入新的副檔名（例如 <code>.mkv</code>）</p>
                <input
                  className="ext-input"
                  autoFocus
                  placeholder=".mkv"
                  value={newExtInput}
                  onChange={e => setNewExtInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleBatchRenameExt(); if (e.key === 'Escape') setShowRenameDialog(false) }}
                />
                <div className="dialog-actions">
                  <button className="btn" onClick={() => setShowRenameDialog(false)}>取消</button>
                  <button className="btn primary" onClick={handleBatchRenameExt}>確認重命名</button>
                </div>
              </div>
            </div>
          )}

          {/* ── Extracting overlay ── */}
          {extracting && (
            <div className="modal-backdrop">
              <div style={{ color: 'white', textAlign: 'center' }}>
                <div style={{ fontSize: '2rem', marginBottom: '12px' }}>⏳</div>
                <p>解壓縮中，請稍候...</p>
              </div>
            </div>
          )}

          {/* ── Rubber-band selection box ── */}
          {selectionBox && selectionBox.w > 4 && selectionBox.h > 4 && (
            <div className="selection-box" style={{
              left: selectionBox.x, top: selectionBox.y,
              width: selectionBox.w, height: selectionBox.h
            }} />
          )}

          {/* ── Extract Password + Mode Dialog ── */}
          {extractDialog && (
            <ExtractDialog
              archivePaths={extractDialog.archivePaths}
              defaultMode={extractDialog.mode}
              onConfirm={(mode, password) => {
                setExtractDialog(null)
                startExtract(extractDialog.archivePaths, mode, password)
              }}
              onCancel={() => setExtractDialog(null)}
            />
          )}

          {/* ── Extract Progress Panel (non-blocking) ── */}
          {extractQueue.length > 0 && (
            <div className="extract-progress-panel">
              <div className="extract-panel-header">
                <span>📦 解壓縮{extractQueue.some(q=>!q.done) ? '中' : '完成'}</span>
                {extractQueue.every(q => q.done) && (
                  <button className="clear-btn" onClick={() => setExtractQueue([])}><X size={14}/></button>
                )}
              </div>
              {extractQueue.map((q, i) => {
                const archiveName = q.archive.split(/[/\\]/).pop()
                return (
                  <div key={i} className="extract-item">
                    <div className="extract-item-name" title={q.archive}>{archiveName}</div>
                    {q.done ? (
                      q.error ? (
                        <div className="extract-error">
                          {q.error === 'wrong_password' ? '❌ 密碼錯誤，請重試' : '❌ 解壓縮失敗'}
                          {q.error === 'wrong_password' && (
                            <button className="btn" style={{marginLeft:8,padding:'2px 8px',fontSize:'0.75rem'}}
                              onClick={() => setExtractDialog({ archivePaths: [q.archive], mode: 'here' })}>重試</button>
                          )}
                        </div>
                      ) : (
                        <div className="extract-success">✅ 完成！{q.total > 0 ? ` (${q.total} 個檔案)` : ''}</div>
                      )
                    ) : (
                      <>
                        <div className="extract-progress-track">
                          <div
                            className={`extract-progress-fill ${q.percent < 0 ? 'indeterminate' : ''}`}
                            style={{ width: q.percent >= 0 ? `${q.percent}%` : '100%' }}
                          />
                        </div>
                        <div className="extract-item-status">
                          {q.percent >= 0 ? `${q.percent}%` : ''}
                          {q.total > 0 ? ` (${q.extracted}/${q.total})` : ''}
                        </div>
                        {q.current && <div className="extract-current" title={q.current}>{q.current}</div>}
                      </>
                    )}
                  </div>
                )
              })}
            </div>
          )}
          {hierarchyCtxMenu && (
            <>
              <div style={{ position: 'fixed', inset: 0, zIndex: 399 }} onClick={closeHierarchyCtxMenu} onContextMenu={e => { e.preventDefault(); closeHierarchyCtxMenu() }} />
              <div
                className="hierarchy-ctx-menu"
                style={{ left: hierarchyCtxMenu.x, top: hierarchyCtxMenu.y }}
                onClick={closeHierarchyCtxMenu}
              >
                {hierarchyCtxMenu.file.category === 'video' && (
                  <>
                    <button onClick={() => { const vi = (allFiles.videos||[]).findIndex(v=>v.path===hierarchyCtxMenu.file.path); if(vi!==-1) handlePlayVideo(vi) }}>▶ 播放影片</button>
                    <button onClick={() => window.electronAPI?.showContextMenu('video', hierarchyCtxMenu.file.path, favorites.some(f=>f.path===hierarchyCtxMenu.file.path))}>在檔案總管中定位</button>
                    <div className="ctx-divider" />
                  </>
                )}
                {isArchive(hierarchyCtxMenu.file.path) && (
                  <>
                    <button onClick={() => handleExtractArchive('here', [...selectedFiles].filter(isArchive))}>📦 解壓縮到此處</button>
                    <button onClick={() => handleExtractArchive('subfolder', [...selectedFiles].filter(isArchive))}>📁 解壓縮到各別資料夾</button>
                    <div className="ctx-divider" />
                  </>
                )}
                <button onClick={() => { setShowRenameDialog(true) }}>✏️ 重命名副檔名 ({selectedFiles.size} 個)</button>
                <div className="ctx-divider" />
                {hierarchyCtxMenu.file.category === 'video' && (
                  <button onClick={() => {
                    const isFav = favorites.some(f => f.path === hierarchyCtxMenu.file.path)
                    if (isFav) {
                      window.electronAPI.removeFavorite(hierarchyCtxMenu.file.path).then(setFavorites)
                    } else {
                      window.electronAPI.addFavorite({ path: hierarchyCtxMenu.file.path, name: hierarchyCtxMenu.file.name, type: 'video' }).then(setFavorites)
                    }
                  }}>{favorites.some(f=>f.path===hierarchyCtxMenu.file.path) ? '💔 移除最愛' : '❤️ 加入最愛'}</button>
                )}
                <button onClick={() => { navigator.clipboard?.writeText(hierarchyCtxMenu.file.path) }}>📋 複製路徑</button>
              </div>
            </>
          )}

          <div style={{ display: currentPage === 'home' && !currentFolder ? 'flex' : 'none', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
              <header className="header">
                <h1>影音資料庫</h1>
                <div style={{ display: 'flex', gap: '12px' }}>
                  <span style={{ color: '#64748b', fontSize: '0.9rem', alignSelf: 'center' }}>支援全螢幕拖曳檔案</span>
                  <button className="btn primary" onClick={handleAddCollection}>
                    <FolderPlus size={18} /> 新增資料夾
                  </button>
                </div>
              </header>
              
              <main className="scrollable">
                {collections.length === 0 ? (
                  <div className="empty-state">
                    <Folder size={64} opacity={0.3} />
                    <h2>空空如也</h2>
                    <p>點擊右上角新增，或直接將資料夾 / 影片拖曳到視窗中</p>
                  </div>
                ) : (
                  <div className="collection-grid">
                    {collections.map(folder => (
                      <CollectionCard 
                        key={folder.path}
                        folder={folder}
                        onClick={() => handleOpenFolder(folder)}
                        onContextMenu={(e) => handleContextMenu(e, 'folder', folder.path)}
                        onRemove={(e) => handleRemoveCollection(e, folder.path)}
                      />
                    ))}
                  </div>
                )}
              </main>
          </div>

          <div style={{ display: currentPage === 'favorites' ? 'flex' : 'none', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
              <header className="header">
                <h1>我的最愛</h1>
              </header>
              <main className="scrollable">
                {favorites.length === 0 ? (
                  <div className="empty-state">
                    <Heart size={64} opacity={0.3} />
                    <h2>尚無最愛項目</h2>
                    <p>在影片或資料夾上點擊右鍵，選擇「加入最愛」即可在這裡看到它們</p>
                  </div>
                ) : (
                  <div style={{ padding: '24px' }}>
                    {favorites.filter(f => f.type === 'bookmark').length > 0 && (
                      <div style={{ marginBottom: '32px' }}>
                        <h2 style={{ fontSize: '1.2rem', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <Globe size={20} /> 網頁書籤
                        </h2>
                        <div className="collection-grid">
                          {favorites.filter(f => f.type === 'bookmark').map(fav => (
                            <div key={fav.path} className="collection-card" style={{ height: 'auto', padding: '16px' }}
                                 onClick={() => {
                                    setBrowserInputUrl(fav.path)
                                    setCurrentBrowserUrl(fav.path)
                                    if(webviewRef.current) webviewRef.current.loadURL(fav.path)
                                    setCurrentPage('browser')
                                 }}
                                 onContextMenu={(e) => handleContextMenu(e, 'bookmark', fav.path)}
                            >
                               <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                 <div style={{ background: 'rgba(255,255,255,0.1)', padding: '12px', borderRadius: '8px' }}>
                                   <Globe size={24} />
                                 </div>
                                 <div style={{ flex: 1, overflow: 'hidden' }}>
                                   <h3 style={{ margin: 0, textOverflow: 'ellipsis', whiteSpace: 'nowrap', overflow: 'hidden' }}>{fav.name}</h3>
                                 </div>
                                 <button className="remove-btn" style={{ position: 'relative', top: 0, right: 0 }} onClick={(e) => { e.stopPropagation(); window.electronAPI.removeFavorite(fav.path).then(setFavorites) }}><Trash2 size={16} /></button>
                               </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {favorites.filter(f => f.type === 'folder').length > 0 && (
                      <div style={{ marginBottom: '32px' }}>
                        <h2 style={{ fontSize: '1.2rem', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <Folder size={20} /> 資料夾
                        </h2>
                        <div className="collection-grid">
                          {favorites.filter(f => f.type === 'folder').map(fav => (
                            <CollectionCard 
                              key={fav.path} folder={fav} 
                              onClick={() => {
                                setCurrentPage('home')
                                handleOpenFolder(fav)
                              }}
                              onContextMenu={(e) => handleContextMenu(e, 'folder', fav.path)}
                              onRemove={(e) => { e.stopPropagation(); window.electronAPI.removeFavorite(fav.path).then(setFavorites) }}
                            />
                          ))}
                        </div>
                      </div>
                    )}
                    {favorites.some(f => f.type === 'video') && (
                      <div>
                        <h2 style={{ fontSize: '1.1rem', marginBottom: '16px', color: 'var(--text-secondary)' }}>影片</h2>
                        <div className="grid">
                          {favorites.filter(f => f.type === 'video').map((vid, index) => {
                            const favVideos = favorites.filter(f => f.type === 'video');
                            return (
                              <div 
                                key={vid.path} 
                                className="card" 
                                onClick={() => {
                                  if (settings.playbackBehavior === 'popout') {
                                    if (window.electronAPI) {
                                      window.electronAPI.openPopoutPlayer({
                                        playingIndex: index,
                                        playlist: favVideos,
                                        alwaysOnTop: settings.defaultAlwaysOnTop
                                      })
                                    }
                                  } else {
                                    setVideos(favVideos);
                                    setPlayingIndex(index);
                                    setCurrentFolder(null);
                                    setViewMode('grid');
                                    setCurrentPage('home');
                                  }
                                }}
                                onContextMenu={(e) => handleContextMenu(e, 'video', vid.path)}
                              >
                                <Thumbnail videoPath={vid.path} />
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  <PlayCircle size={18} className="icon" />
                                  <h3 title={vid.name}>{vid.name}</h3>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </main>
          </div>

          <div style={
            currentPage === 'browser' 
            ? { display: 'flex', flexDirection: 'column', height: '100%', flex: 1 } 
            : { position: 'absolute', top: '-9999px', width: '1px', height: '1px', overflow: 'hidden' }
          }>
            <div style={{ display: 'flex', padding: '12px', background: 'var(--bg-card)', borderBottom: '1px solid rgba(255,255,255,0.05)', gap: '8px', alignItems: 'center' }}>
              <button className="btn" onClick={() => handleBrowserNav('back')}><ArrowLeft size={16} /></button>
              <button className="btn" onClick={() => handleBrowserNav('forward')}><ArrowRight size={16} /></button>
              <button className="btn" onClick={() => handleBrowserNav('reload')}><RotateCcw size={16} /></button>
              <form onSubmit={handleBrowserGo} style={{ flex: 1, display: 'flex' }}>
                <input 
                  type="text" 
                  value={browserInputUrl}
                  onChange={(e) => setBrowserInputUrl(e.target.value)}
                  style={{ flex: 1, padding: '8px 16px', borderRadius: '20px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.3)', color: 'white', outline: 'none' }}
                />
              </form>
              <button 
                className="btn primary" 
                onClick={handleAddBookmark}
                title="加入最愛"
              >
                <Bookmark size={16} />
              </button>
            </div>
            <webview 
              ref={webviewRef}
              src={settings.browserUrl || 'https://www.google.com'} 
              style={{ flex: 1, border: 'none', background: 'white' }}
              allowpopups="true"
            ></webview>
          </div>

          {toast && (
            <div style={{
              position: 'fixed', bottom: 24, right: 24, background: 'var(--accent-color)', color: 'white',
              padding: '12px 24px', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
              display: 'flex', alignItems: 'center', gap: '16px', zIndex: 1000, animation: 'fadeIn 0.3s'
            }}>
              <span>{toast.message}</span>
              <button 
                onClick={handleUndoMove}
                style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: 'white', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer' }}
              >
                復原
              </button>
            </div>
          )}

        </div>
      </main>
    </div>
  )
}
