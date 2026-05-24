import { useState, useCallback } from 'react';

export default function usePlaylist(initialList = [], initialIndex = -1, shouldLoop = false) {
  const [playlist, setPlaylist] = useState(initialList);
  const [currentIndex, setCurrentIndex] = useState(initialIndex);

  const setListAndIndex = useCallback((list, index) => {
    setPlaylist(list);
    setCurrentIndex(index);
  }, []);

  const next = useCallback((loopOverride) => {
    if (playlist.length === 0) return;
    const loop = loopOverride !== undefined ? loopOverride : shouldLoop;
    
    let nextIndex = currentIndex + 1;
    if (nextIndex >= playlist.length) {
      if (loop) nextIndex = 0;
      else {
        setCurrentIndex(-1);
        return;
      }
    }
    setCurrentIndex(nextIndex);
  }, [playlist.length, currentIndex, shouldLoop]);

  const prev = useCallback((loopOverride) => {
    if (playlist.length === 0) return;
    const loop = loopOverride !== undefined ? loopOverride : shouldLoop;
    
    let prevIndex = currentIndex - 1;
    if (prevIndex < 0) {
      if (loop) prevIndex = playlist.length - 1;
      else {
        setCurrentIndex(-1);
        return;
      }
    }
    setCurrentIndex(prevIndex);
  }, [playlist.length, currentIndex, shouldLoop]);

  const close = useCallback(() => {
    setCurrentIndex(-1);
  }, []);

  return {
    playlist,
    currentIndex,
    setCurrentIndex,
    setPlaylist,
    setListAndIndex,
    next,
    prev,
    close,
    currentItem: currentIndex >= 0 && currentIndex < playlist.length ? playlist[currentIndex] : null
  };
}
