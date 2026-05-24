import React, { useState, useEffect, useRef } from 'react'

const thumbnailCache = new Map()

// Global Queue for browser-based fallback thumbnail extraction
const globalExtractionQueue = new Set()
let activeExtractions = 0
const MAX_CONCURRENT = 1 // Strict limit to prevent media:// connection starvation

function processQueue() {
  if (activeExtractions >= MAX_CONCURRENT || globalExtractionQueue.size === 0) return
  const nextTask = globalExtractionQueue.values().next().value
  globalExtractionQueue.delete(nextTask)
  activeExtractions++
  nextTask.start()
}

export default function Thumbnail({ mediaPath, type = 'video' }) {
  const [thumbUrl, setThumbUrl] = useState(thumbnailCache.get(mediaPath) || null)
  const [error, setError] = useState(false)
  const [isInView, setIsInView] = useState(!!thumbnailCache.get(mediaPath) || type === 'image')
  
  const containerRef = useRef(null)
  const videoRef = useRef(null)
  const canvasRef = useRef(null)

  // Intersection Observer for lazy loading
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        setIsInView(entries[0].isIntersecting)
      },
      { rootMargin: '100px' } // Load slightly before it comes into view
    )

    if (containerRef.current) {
      observer.observe(containerRef.current)
    }

    return () => {
      observer.disconnect()
    }
  }, [])

  // Cleanup video src to avoid lingering network requests when video unmounts
  useEffect(() => {
    const v = videoRef.current
    if (v) {
      if (!v.getAttribute('src')) {
        v.src = window.electronAPI.convertPathToMediaUrl(mediaPath)
      }
    }
    return () => {
      if (v) {
        v.pause()
        v.removeAttribute('src')
        v.load()
      }
    }
  }, [isInView, thumbUrl])

  const [needsExtraction, setNeedsExtraction] = useState(false)
  const [isMyTurn, setIsMyTurn] = useState(false)

  // Step 1: Fast cache check without queueing
  useEffect(() => {
    if (!isInView || thumbUrl || error) return
    let isMounted = true

    if (type === 'image') {
      const url = window.electronAPI.convertPathToMediaUrl(mediaPath)
      thumbnailCache.set(mediaPath, url)
      setThumbUrl(url)
      return
    }

    if (window.electronAPI) {
      window.electronAPI.getThumbnail(mediaPath).then(diskUrl => {
        if (!isMounted) return
        if (diskUrl) {
          thumbnailCache.set(mediaPath, diskUrl)
          setThumbUrl(diskUrl)
        } else {
          setNeedsExtraction(true)
        }
      })
    } else {
      setNeedsExtraction(true)
    }

    return () => { isMounted = false }
  }, [isInView, mediaPath, thumbUrl, error, type])

  // Step 2: Global queueing to prevent Chromium connection exhaustion
  useEffect(() => {
    if (!needsExtraction || thumbUrl || error || !isInView) return
    let isMounted = true
    let started = false

    const task = {
      start: () => {
        if (!isMounted) {
          activeExtractions--
          processQueue()
          return
        }
        started = true
        setIsMyTurn(true)
      }
    }
    
    globalExtractionQueue.add(task)
    processQueue()

    return () => {
      isMounted = false
      if (started) {
        setIsMyTurn(false)
        activeExtractions--
        processQueue()
      } else {
        globalExtractionQueue.delete(task)
      }
    }
  }, [needsExtraction, thumbUrl, error, isInView])

  // Step 3: Extract from video once it's my turn
  useEffect(() => {
    if (!isMyTurn || !isInView || thumbUrl || error || type !== 'video') return
    let isMounted = true

    const v = videoRef.current
    if (!v) return
    
    const extractFrame = () => {
      const canvas = canvasRef.current
      if (!v || !canvas) return

      const vWidth = v.videoWidth || 1920
      const vHeight = v.videoHeight || 1080
      const aspectRatio = vWidth / vHeight

      canvas.width = 320
      canvas.height = 320 / aspectRatio
      const ctx = canvas.getContext('2d')
      ctx.drawImage(v, 0, 0, canvas.width, canvas.height)
      
      try {
        const dataUrl = canvas.toDataURL('image/jpeg', 0.5) // Compresses slightly for memory
        thumbnailCache.set(mediaPath, dataUrl)
        if (window.electronAPI) window.electronAPI.saveThumbnail(mediaPath, dataUrl)
        if (isMounted) setThumbUrl(dataUrl)
      } catch (e) {
        if (isMounted) setError(true)
      }
    }

    const onLoaded = () => {
      if (!isMounted) return
      v.addEventListener('seeked', extractFrame, { once: true })
      v.currentTime = 1
    }
    
    v.addEventListener('error', () => {
      if (isMounted) setError(true)
    }, { once: true })

    if (v.readyState >= 1) {
      onLoaded()
    } else {
      v.addEventListener('loadedmetadata', onLoaded, { once: true })
    }

    return () => {
      isMounted = false
    }
  }, [isMyTurn, isInView, thumbUrl, error, type, mediaPath])

  return (
    <div className="thumbnail-container" ref={containerRef}>
      {error ? (
        <div style={{display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#666'}}>No Preview</div>
      ) : thumbUrl ? (
        <img src={thumbUrl} alt="Thumbnail" />
      ) : isInView ? (
        <>
          <div className="skeleton-thumb"></div>
          {type === 'video' && isMyTurn && (
            <>
              <video 
                ref={videoRef}
                src={window.electronAPI.convertPathToMediaUrl(mediaPath)} 
                style={{ display: 'none' }}
                preload="metadata"
                muted
              />
              <canvas ref={canvasRef} style={{ display: 'none' }} />
            </>
          )}
        </>
      ) : (
        <div className="skeleton-thumb"></div>
      )}
    </div>
  )
}
