import React, { useState, useEffect, useRef } from 'react'
import { Folder, FolderPlus, Trash2, PlayCircle, ArrowLeft, LayoutGrid, List, AlignJustify, MonitorPlay, ChevronDown, ChevronUp, Home, Settings, HardDrive, Menu, Heart, Globe, FolderTree, ArrowUp, ArrowRight, RotateCcw, Bookmark, ExternalLink } from 'lucide-react'
import VideoPlayer from './components/VideoPlayer'
import Thumbnail from './components/Thumbnail'

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
  const [settings, setSettings] = useState({ defaultViewMode: 'grid', cachePath: '', playbackBehavior: 'inline', defaultAlwaysOnTop: false, gridItemsPerPage: 48, browserUrl: 'https://www.google.com' })
  
  const [favorites, setFavorites] = useState([])
  
  // Pagination state
  const [currentPageIndex, setCurrentPageIndex] = useState(0)
  
  // Popout mode state
  const [isPopoutMode, setIsPopoutMode] = useState(false)
  const [popoutData, setPopoutData] = useState(null)

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
    
    setIsLoading(true)
    if (window.electronAPI) {
      if (folder.mode === 'hierarchy') {
        const data = await window.electronAPI.scanHierarchy(targetPath)
        setVideos(data.videos)
        setSubfolders(data.folders)
      } else {
        setSubfolders([])
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

  const paginatedVideos = React.useMemo(() => {
    if (viewMode !== 'grid' || !settings.gridItemsPerPage || settings.gridItemsPerPage === 'all') {
      return sortedVideos
    }
    const start = currentPageIndex * settings.gridItemsPerPage
    return sortedVideos.slice(start, start + settings.gridItemsPerPage)
  }, [sortedVideos, viewMode, settings.gridItemsPerPage, currentPageIndex])

  const totalPages = settings.gridItemsPerPage && settings.gridItemsPerPage !== 'all'
    ? Math.ceil(sortedVideos.length / settings.gridItemsPerPage)
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
                  <div className="view-toggles" style={{ marginTop: '16px', background: 'rgba(0,0,0,0.2)' }}>
                    <button className={`view-btn ${settings.gridItemsPerPage === 24 ? 'active' : ''}`} onClick={() => saveSettings({ gridItemsPerPage: 24 })}>24 筆</button>
                    <button className={`view-btn ${settings.gridItemsPerPage === 48 || !settings.gridItemsPerPage ? 'active' : ''}`} onClick={() => saveSettings({ gridItemsPerPage: 48 })}>48 筆</button>
                    <button className={`view-btn ${settings.gridItemsPerPage === 96 ? 'active' : ''}`} onClick={() => saveSettings({ gridItemsPerPage: 96 })}>96 筆</button>
                    <button className={`view-btn ${settings.gridItemsPerPage === 'all' ? 'active' : ''}`} onClick={() => saveSettings({ gridItemsPerPage: 'all' })}>全部載入</button>
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
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <div className="view-toggles no-drag" style={{ background: 'var(--bg-card)' }}>
                    <button 
                      className={`view-btn ${currentFolder?.mode !== 'hierarchy' ? 'active' : ''}`} 
                      onClick={handleToggleMode} 
                      title="扁平模式"
                    >
                      扁平
                    </button>
                    <button 
                      className={`view-btn ${currentFolder?.mode === 'hierarchy' ? 'active' : ''}`} 
                      onClick={handleToggleMode} 
                      title="樹狀模式"
                    >
                      <FolderTree size={16} style={{ marginRight: 4 }}/> 樹狀
                    </button>
                  </div>

                  <div className="view-toggles no-drag">
                    <button className={`view-btn ${viewMode === 'grid' ? 'active' : ''}`} onClick={() => { setViewMode('grid'); setPlayingIndex(-1) }} title="網格顯示"><LayoutGrid size={18} /></button>
                    <button className={`view-btn ${viewMode === 'list' ? 'active' : ''}`} onClick={() => { setViewMode('list'); setPlayingIndex(-1) }} title="條列顯示"><List size={18} /></button>
                    <button className={`view-btn ${viewMode === 'compact' ? 'active' : ''}`} onClick={() => { setViewMode('compact'); setPlayingIndex(-1) }} title="無縮圖清單"><AlignJustify size={18} /></button>
                    <button className={`view-btn ${viewMode === 'theatre' ? 'active' : ''}`} onClick={() => setViewMode('theatre')} title="劇場模式"><MonitorPlay size={18} /></button>
                  </div>
                  <div style={{ color: 'var(--text-secondary)' }}>
                    {sortedVideos.length} 部影片
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
                        {currentFolder?.mode === 'hierarchy' && subfolders.length > 0 && (
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
                            {sortedVideos.map((vid, index) => (
                              <tr 
                                key={vid.path}
                                onClick={() => handlePlayVideo(index)}
                                onContextMenu={(e) => handleContextMenu(e, 'video', vid.path)}
                              >
                                <td>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <PlayCircle size={16} style={{ color: 'var(--accent-color)' }} />
                                    {vid.name}
                                  </div>
                                </td>
                                <td>{formatDate(vid.date)}</td>
                                <td>{formatSize(vid.size)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <>
                        {currentFolder?.mode === 'hierarchy' && subfolders.length > 0 && (
                          <div style={{ marginBottom: '24px' }}>
                            <h3 style={{ fontSize: '1rem', color: '#94a3b8', marginBottom: '16px' }}>子資料夾</h3>
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
                        <div className={viewMode === 'grid' ? 'grid' : 'list-view'}>
                          {paginatedVideos.map((vid, index) => {
                            const actualIndex = (viewMode === 'grid' && settings.gridItemsPerPage && settings.gridItemsPerPage !== 'all') 
                              ? (currentPageIndex * settings.gridItemsPerPage) + index 
                              : index;
                            return (
                              <div 
                                key={vid.path} 
                                className="card" 
                                onClick={() => handlePlayVideo(actualIndex)}
                                onContextMenu={(e) => handleContextMenu(e, 'video', vid.path)}
                                draggable="true"
                                onDragStart={(e) => handleDragStart(e, vid.path)}
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
                        
                        {viewMode === 'grid' && totalPages > 1 && (
                          <div className="pagination-controls no-drag">
                            <button className="btn" disabled={currentPageIndex === 0} onClick={() => setCurrentPageIndex(p => p - 1)}>上一頁</button>
                            <span style={{ color: 'var(--text-secondary)' }}>第 {currentPageIndex + 1} 頁 / 共 {totalPages} 頁</span>
                            <button className="btn" disabled={currentPageIndex === totalPages - 1} onClick={() => setCurrentPageIndex(p => p + 1)}>下一頁</button>
                          </div>
                        )}
                      </>
                    )
                  )}
                </main>
              )}
          </div>

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
