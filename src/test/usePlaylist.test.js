import { renderHook, act } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import usePlaylist from '../hooks/usePlaylist';

describe('usePlaylist Hook', () => {
  it('initializes with default values', () => {
    const { result } = renderHook(() => usePlaylist());
    expect(result.current.playlist).toEqual([]);
    expect(result.current.currentIndex).toBe(-1);
    expect(result.current.currentItem).toBeNull();
  });

  it('navigates next and prev correctly without loop', () => {
    const { result } = renderHook(() => usePlaylist([1, 2, 3], 0, false));
    
    act(() => { result.current.next(); });
    expect(result.current.currentIndex).toBe(1);
    expect(result.current.currentItem).toBe(2);

    act(() => { result.current.next(); });
    expect(result.current.currentIndex).toBe(2);
    
    // Boundary end without loop
    act(() => { result.current.next(); });
    expect(result.current.currentIndex).toBe(-1);

    // Set index to start
    act(() => { result.current.setListAndIndex([1, 2, 3], 0); });
    
    // Boundary start without loop
    act(() => { result.current.prev(); });
    expect(result.current.currentIndex).toBe(-1);
  });

  it('navigates next and prev correctly with loop', () => {
    const { result } = renderHook(() => usePlaylist([1, 2, 3], 2, true));
    
    // Loop around to start
    act(() => { result.current.next(); });
    expect(result.current.currentIndex).toBe(0);

    // Loop around to end
    act(() => { result.current.prev(); });
    expect(result.current.currentIndex).toBe(2);
  });

  it('ignores next and prev when playlist is empty', () => {
    const { result } = renderHook(() => usePlaylist([], -1));
    act(() => { result.current.next(); });
    expect(result.current.currentIndex).toBe(-1);

    act(() => { result.current.prev(); });
    expect(result.current.currentIndex).toBe(-1);
  });

  it('closes by resetting index to -1', () => {
    const { result } = renderHook(() => usePlaylist([1, 2], 0));
    act(() => { result.current.close(); });
    expect(result.current.currentIndex).toBe(-1);
  });

  it('allows overriding loop parameter per call', () => {
    const { result } = renderHook(() => usePlaylist([1, 2], 1, false));
    
    // Force loop on next
    act(() => { result.current.next(true); });
    expect(result.current.currentIndex).toBe(0);

    // Force loop on prev
    act(() => { result.current.prev(true); });
    expect(result.current.currentIndex).toBe(1);
  });
});
