import React, { useState, useEffect, useRef } from 'react'
import { Play, Pause, Maximize, SkipBack, SkipForward, Settings, Volume2, VolumeX, ArrowLeft, RotateCcw, FastForward, Rewind, Pin, Captions } from 'lucide-react'

export default function VideoPlayer({ 
  video, 
  playlist = [], 
  onClose, 
  onNext, 
  onPrev,
  isEmbedded = false,
  isPopout = false,
  initialAlwaysOnTop = false,
  settings = {}
}) {
  const videoRef = useRef(null)
  const [isPlaying, setIsPlaying] = useState(true)
  const [progress, setProgress] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [realDuration, setRealDuration] = useState(0)
  const [seekOffset, setSeekOffset] = useState(0)
  const [volume, setVolume] = useState(1)
  const [isMuted, setIsMuted] = useState(false)
  const [showControls, setShowControls] = useState(true)
  const [showSettings, setShowSettings] = useState(false)
  const [isHoveringControls, setIsHoveringControls] = useState(false)
  const isHoveringControlsRef = useRef(false)
  
  // Settings state
  const [playbackRate, setPlaybackRate] = useState(1)
  const [loopMode, setLoopMode] = useState('none') // 'none', 'single', 'playlist'
  const [loopCount, setLoopCount] = useState(1) // times to loop
  const [currentLoop, setCurrentLoop] = useState(0)
  
  const [isAlwaysOnTop, setIsAlwaysOnTop] = useState(initialAlwaysOnTop)
  const [dragStart, setDragStart] = useState(null)

  // Subtitle state
  const [subtitleUrl, setSubtitleUrl] = useState(null)
  const [subtitleEnabled, setSubtitleEnabled] = useState(true)
  const trackRef = useRef(null)
  
  const controlsTimeoutRef = useRef(null)

  const isImage = video?.type === 'image'

  // Image slideshow autoplay logic
  useEffect(() => {
    if (!isImage || !isPlaying) return

    const autoplaySeconds = settings?.imageAutoplaySeconds ?? 5
    if (autoplaySeconds <= 0) return

    const timer = setTimeout(() => {
      if (onNext) onNext()
    }, autoplaySeconds * 1000)

    return () => clearTimeout(timer)
  }, [video, isPlaying, settings, onNext, isImage])

  useEffect(() => {
    // Reset loop count when video changes
    setCurrentLoop(0)
    setIsPlaying(true)
    setSeekOffset(0)
    setRealDuration(0)
    
    if (video?.path && window.electronAPI?.getVideoDuration) {
      window.electronAPI.getVideoDuration(video.path).then((dur) => {
        if (dur) setRealDuration(dur)
      }).catch(() => {})
    }

    // Auto-load subtitle for the new video
    setSubtitleUrl(null)
    if (video?.path && window.electronAPI?.getSubtitles) {
      window.electronAPI.getSubtitles(video.path).then((subs) => {
        if (subs && subs.length > 0) {
          // just auto load the first one found
          setSubtitleUrl(window.electronAPI.convertPathToMediaUrl(subs[0].path))
          setSubtitleEnabled(true)
        }
      })
    }
  }, [video])

  // Cleanup video src on unmount to prevent leaked stream connections
  useEffect(() => {
    const el = videoRef.current;
    if (el && video) {
      // React 18 Strict Mode workaround: re-apply src if it was wiped by the simulated unmount
      if (!el.getAttribute('src')) {
        const mediaUrl = window.electronAPI.convertPathToMediaUrl(video.path)
        el.src = mediaUrl + (seekOffset > 0 ? `?seek=${seekOffset}` : '')
      }
    }
    return () => {
      if (el) {
        el.pause();
        el.removeAttribute('src');
        el.load();
      }
    }
  }, [video?.path, seekOffset]);

  // Sync playing state with video element when switching to video
  useEffect(() => {
    if (isImage || !videoRef.current) return;
    if (isPlaying) {
      videoRef.current.play().catch(e => console.warn('Auto-play prevented', e));
    } else {
      videoRef.current.pause();
    }
  }, [isPlaying, isImage]);

  // Ref to hold latest props to avoid stale closures in event listeners
  const latestProps = useRef({ onNext, onPrev, settings, skip: () => {} })
  useEffect(() => {
    latestProps.current = { onNext, onPrev, settings, skip }
  })

  useEffect(() => {
    isHoveringControlsRef.current = isHoveringControls
  }, [isHoveringControls])

  useEffect(() => {
    const wakeUpControls = () => {
      setShowControls(true)
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current)
      controlsTimeoutRef.current = setTimeout(() => {
        if (isPlaying && !showSettings && !isHoveringControlsRef.current) {
          setShowControls(false)
        }
      }, 3000)
    }

    const handleMouseMove = () => {
      wakeUpControls()
    }

    const handleKeyDown = (e) => {
      // Don't intercept if user is typing in an input
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return

      // Handle custom shortcuts for prev/next
      const currentProps = latestProps.current
      const prevKey = currentProps.settings?.shortcuts?.prev || 'a'
      const nextKey = currentProps.settings?.shortcuts?.next || 'c'

      if (e.key === prevKey && typeof currentProps.onPrev === 'function') {
        e.preventDefault()
        currentProps.onPrev()
        return
      }
      
      if (e.key === nextKey && typeof currentProps.onNext === 'function') {
        e.preventDefault()
        currentProps.onNext()
        return
      }

      const skipSeconds = currentProps.settings?.skipSeconds || 10

      switch (e.key) {
        case ' ':
          e.preventDefault()
          togglePlay()
          break
        case 'ArrowRight':
          e.preventDefault()
          currentProps.skip(skipSeconds)
          break
        case 'ArrowLeft':
          e.preventDefault()
          currentProps.skip(-skipSeconds)
          break
        case 'ArrowUp':
          e.preventDefault()
          changeVolume(0.1)
          break
        case 'ArrowDown':
          e.preventDefault()
          changeVolume(-0.1)
          break
        case 'f':
        case 'F':
          e.preventDefault()
          toggleFullscreen()
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    // Start timeout immediately if it's currently playing
    if (isPlaying) {
      wakeUpControls()
    }
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current)
    }
  }, [isPlaying, showSettings, volume])

  const togglePlay = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause()
      } else {
        videoRef.current.play()
      }
      setIsPlaying(!isPlaying)
    }
  }

  const changeVolume = (delta) => {
    let newVolume = volume + delta
    if (newVolume > 1) newVolume = 1
    if (newVolume < 0) newVolume = 0
    setVolume(newVolume)
    if (videoRef.current) videoRef.current.volume = newVolume
    setIsMuted(newVolume === 0)
  }

  const handleContextMenu = (e) => {
    e.preventDefault()
    if (window.electronAPI && window.electronAPI.showContextMenu) {
      window.electronAPI.showContextMenu('video', video.path)
    }
  }

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      const displayTime = seekOffset + videoRef.current.currentTime
      setCurrentTime(displayTime)
      const maxDur = realDuration || duration || videoRef.current.duration
      if (maxDur && isFinite(maxDur)) {
        setProgress((displayTime / maxDur) * 100)
      }
    }
  }

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration)
      videoRef.current.playbackRate = playbackRate
      videoRef.current.play().catch(e => console.error("Auto-play prevented", e))
    }
  }

  const doSeek = (targetTime) => {
    if (!videoRef.current) return
    const maxDur = realDuration || duration || videoRef.current.duration
    let finalTime = targetTime
    if (finalTime < 0) finalTime = 0
    if (maxDur && isFinite(maxDur) && finalTime > maxDur) finalTime = maxDur
    
    const isTranscodedStream = !isFinite(videoRef.current.duration)
    
    if (isTranscodedStream) {
      // Transcoded stream: need to trigger a reload with ?seek=
      setSeekOffset(finalTime)
      // Playback will automatically resume because of autoPlay on <video>
    } else {
      // Native stream: just seek
      videoRef.current.currentTime = finalTime
    }
  }

  const handleSeek = (e) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const pos = (e.clientX - rect.left) / rect.width
    const maxDur = realDuration || duration || videoRef.current.duration
    if (maxDur && isFinite(maxDur)) {
      doSeek(pos * maxDur)
    }
  }

  const skip = (seconds) => {
    doSeek(currentTime + seconds)
  }

  const handleEnded = () => {
    if (loopMode === 'single') {
      if (loopCount === 0 || currentLoop < loopCount - 1) { // 0 means infinite
        setCurrentLoop(prev => prev + 1)
        videoRef.current.currentTime = 0
        videoRef.current.play()
        return
      }
    } else if (loopMode === 'playlist') {
       if (onNext) {
          onNext(loopCount === 0 || currentLoop < loopCount - 1) // pass flag if it's playlist looping
       }
       return
    }
    
    // Normal auto-advance if playlist exists
    if (onNext) onNext(false)
    else setIsPlaying(false)
  }

  const formatTime = (time) => {
    if (isNaN(time)) return "00:00"
    const mins = Math.floor(time / 60)
    const secs = Math.floor(time % 60)
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen()
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen()
      }
    }
  }

  const handleVideoMouseDown = (e) => {
    if (e.button !== 0) return
    setDragStart({ x: e.screenX, y: e.screenY })
  }

  const handleVideoMouseMove = (e) => {
    if (dragStart && isPopout) {
      const dx = e.screenX - dragStart.x
      const dy = e.screenY - dragStart.y
      if (Math.abs(dx) > 0 || Math.abs(dy) > 0) {
        if (window.electronAPI && window.electronAPI.windowMove) {
          window.electronAPI.windowMove(dx, dy)
        }
        setDragStart({ x: e.screenX, y: e.screenY })
      }
    }
  }

  const handleVideoMouseUp = () => {
    if (dragStart) {
      togglePlay()
      setDragStart(null)
    }
  }

  const handleRateChange = (e) => {
    const rate = parseFloat(e.target.value)
    setPlaybackRate(rate)
    if (videoRef.current) videoRef.current.playbackRate = rate
  }

  const handleContainerMouseLeave = () => {
    if (isPlaying && !showSettings) {
      setShowControls(false)
    }
  }

  if (!video) {
    return <div style={{ color: 'white', padding: 20 }}>No video selected</div>
  }

  return (
    <div 
      className={isEmbedded ? "player-embedded" : "player-overlay"} 
      onContextMenu={handleContextMenu}
      onDoubleClick={toggleFullscreen}
      onMouseMove={(e) => {
        const rect = e.currentTarget.getBoundingClientRect()
        const y = e.clientY - rect.top
        const height = rect.height
        
        // Show controls if near top (e.g., top 100px) or near bottom (e.g., bottom 150px)
        if (y < 100 || y > height - 150) {
          setShowControls(true)
          if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current)
          controlsTimeoutRef.current = setTimeout(() => {
            if (isPlaying && !showSettings && !isHoveringControlsRef.current) setShowControls(false)
          }, 3000)
        }
      }}
      onMouseLeave={handleContainerMouseLeave}
    >
      {isImage ? (
        <img
          key={`${video.path}`}
          src={window.electronAPI.convertPathToMediaUrl(video.path)}
          className="video-element"
          style={{ objectFit: 'contain', width: '100%', height: '100%' }}
          onMouseDown={handleVideoMouseDown}
          onMouseMove={handleVideoMouseMove}
          onMouseUp={handleVideoMouseUp}
          onMouseLeave={() => setDragStart(null)}
          alt={video.name}
        />
      ) : (
        <video
          key={`${video.path}-${seekOffset}`}
          ref={videoRef}
          src={window.electronAPI.convertPathToMediaUrl(video.path) + (seekOffset > 0 ? `?seek=${seekOffset}` : '')}
          className="video-element"
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={handleLoadedMetadata}
          onEnded={handleEnded}
          onMouseDown={handleVideoMouseDown}
          onMouseMove={handleVideoMouseMove}
          onMouseUp={handleVideoMouseUp}
          onMouseLeave={() => setDragStart(null)}
          autoPlay
        >
          {subtitleUrl && (
            <track
              ref={trackRef}
              key={subtitleUrl}
              kind="subtitles"
              src={subtitleUrl}
              default={subtitleEnabled}
            />
          )}
        </video>
      )}
      
      <div 
        className={`top-bar ${!showControls ? 'hidden' : ''}`}
        onMouseEnter={() => setIsHoveringControls(true)}
        onMouseLeave={() => setIsHoveringControls(false)}
      >
        <button className="control-btn" onClick={onClose}>
          <ArrowLeft size={28} />
        </button>
        <div style={{ color: 'white', fontWeight: 500 }}>{video.name}</div>
        <div style={{ width: 28 }}></div>
      </div>

      <div 
        className={`controls-container ${!showControls ? 'hidden' : ''}`}
        onMouseEnter={() => setIsHoveringControls(true)}
        onMouseLeave={() => setIsHoveringControls(false)}
      >
        {!isImage && (
          <div className="progress-bar-container" onClick={handleSeek}>
            <div className="progress-fill" style={{ width: `${progress}%` }}>
              <div className="progress-thumb" />
            </div>
          </div>
        )}

        <div className="controls-row">
          <div className="controls-group">
            {!isImage && <button className="control-btn" onClick={() => skip(-(settings?.skipSeconds || 10))}><Rewind size={20} /></button>}
            <button className="control-btn" onClick={onPrev}><SkipBack size={24} /></button>
            <button className="control-btn" onClick={togglePlay}>
              {isPlaying ? <Pause size={32} /> : <Play size={32} />}
            </button>
            <button className="control-btn" onClick={onNext}><SkipForward size={24} /></button>
            {!isImage && <button className="control-btn" onClick={() => skip(settings?.skipSeconds || 10)}><FastForward size={20} /></button>}
            
            {!isImage && (
              <span className="time-display text-white">
                {formatTime(currentTime)} / {formatTime(realDuration || duration)}
              </span>
            )}
          </div>

          <div className="controls-group">
            {!isImage && (
              <>
                <button className="control-btn" onClick={() => setIsMuted(!isMuted)}>
                  {isMuted ? <VolumeX size={24} /> : <Volume2 size={24} />}
                </button>
                <input 
                  type="range" 
                  min="0" max="1" step="0.05" 
                  value={isMuted ? 0 : volume}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value)
                    setVolume(v)
                    if (videoRef.current) videoRef.current.volume = v
                    setIsMuted(v === 0)
                  }}
                  style={{ width: '80px', cursor: 'pointer' }}
                />
              </>
            )}

            <div style={{ position: 'relative' }}>
              <button className="control-btn" onClick={() => setShowSettings(!showSettings)}>
                <Settings size={24} />
              </button>
              
              {showSettings && (
                <div className="settings-menu no-drag">
                  <h4>播放設定</h4>
                  {!isImage && (
                    <div className="settings-row">
                      <span>速度</span>
                      <select value={playbackRate} onChange={handleRateChange}>
                        <option value="0.5">0.5x</option>
                        <option value="1">1.0x</option>
                        <option value="1.5">1.5x</option>
                        <option value="2">2.0x</option>
                      </select>
                    </div>
                  )}
                  <div className="settings-row">
                    <span>循環模式</span>
                    <select value={loopMode} onChange={e => setLoopMode(e.target.value)}>
                      <option value="none">不循環</option>
                      <option value="single">單一影片</option>
                      <option value="playlist">資料夾輪播</option>
                    </select>
                  </div>
                  {loopMode !== 'none' && (
                    <div className="settings-row">
                      <span>次數 (0=無限)</span>
                      <input 
                        type="number" 
                        min="0" 
                        max="99" 
                        value={loopCount}
                        onChange={e => setLoopCount(parseInt(e.target.value) || 0)}
                        style={{ width: '60px' }}
                      />
                    </div>
                  )}
                </div>
              )}
            </div>

            <button className="control-btn" onClick={toggleFullscreen}>
              <Maximize size={24} />
            </button>

            {subtitleUrl && (
              <button
                className={`control-btn ${subtitleEnabled ? 'active-pin' : ''}`}
                style={{ color: subtitleEnabled ? 'var(--accent-color)' : 'white' }}
                title={subtitleEnabled ? '關閉字幕' : '開啟字幕'}
                onClick={() => {
                  const next = !subtitleEnabled
                  setSubtitleEnabled(next)
                  // Toggle all text tracks in the video element
                  if (videoRef.current) {
                    for (const t of videoRef.current.textTracks) {
                      t.mode = next ? 'showing' : 'hidden'
                    }
                  }
                }}
              >
                <Captions size={24} />
              </button>
            )}
            
            {isPopout && (
              <button 
                className={`control-btn ${isAlwaysOnTop ? 'active-pin' : ''}`} 
                style={{ color: isAlwaysOnTop ? 'var(--accent-color)' : 'white' }}
                onClick={() => {
                  const newState = !isAlwaysOnTop
                  setIsAlwaysOnTop(newState)
                  if (window.electronAPI) window.electronAPI.toggleAlwaysOnTop(newState)
                }}
                title={isAlwaysOnTop ? "取消置頂" : "視窗置頂"}
              >
                <Pin size={24} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
