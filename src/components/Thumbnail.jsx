import React, { useState, useEffect, useRef } from 'react'

const thumbnailCache = new Map()

export default function Thumbnail({ videoPath }) {
  const [thumbUrl, setThumbUrl] = useState(thumbnailCache.get(videoPath) || null)
  const [error, setError] = useState(false)
  const [isInView, setIsInView] = useState(!!thumbnailCache.get(videoPath))
  
  const containerRef = useRef(null)
  const videoRef = useRef(null)
  const canvasRef = useRef(null)

  // Intersection Observer for lazy loading
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setIsInView(true)
          observer.disconnect()
        }
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

  // Extract thumbnail when in view
  useEffect(() => {
    if (!isInView || thumbUrl || error) return

    let isMounted = true

    const extractFromVideo = () => {
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
          thumbnailCache.set(videoPath, dataUrl)
          if (window.electronAPI) window.electronAPI.saveThumbnail(videoPath, dataUrl)
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
    }

    if (window.electronAPI) {
      window.electronAPI.getThumbnail(videoPath).then(diskUrl => {
        if (!isMounted) return
        if (diskUrl) {
          thumbnailCache.set(videoPath, diskUrl)
          setThumbUrl(diskUrl)
        } else {
          extractFromVideo()
        }
      })
    } else {
      extractFromVideo()
    }

    return () => {
      isMounted = false
    }
  }, [videoPath, isInView, thumbUrl, error])

  return (
    <div className="thumbnail-container" ref={containerRef}>
      {error ? (
        <div style={{display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#666'}}>No Preview</div>
      ) : thumbUrl ? (
        <img src={thumbUrl} alt="Thumbnail" />
      ) : isInView ? (
        <>
          <div style={{display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#666'}}>Loading...</div>
          <video 
            ref={videoRef}
            src={window.electronAPI.convertPathToMediaUrl(videoPath)} 
            style={{ display: 'none' }}
            preload="metadata"
            muted
          />
          <canvas ref={canvasRef} style={{ display: 'none' }} />
        </>
      ) : (
        <div style={{display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#444'}}>...</div>
      )}
    </div>
  )
}
