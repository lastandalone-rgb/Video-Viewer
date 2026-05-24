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
    expect(result.current.currentIndex).toBe(-1); // Resets when out of bounds and no loop

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
});
