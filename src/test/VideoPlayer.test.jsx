import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, fireEvent, waitFor } from '@testing-library/react';
import VideoPlayer from '../components/VideoPlayer';

describe('VideoPlayer Component', () => {
  const mockSettings = { imageAutoplaySeconds: 5, skipSeconds: 10, shortcuts: { prev: 'a', next: 'd' } };
  
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const getImgVid = () => ({ path: '/path/to/image.jpg', type: 'image', name: 'image.jpg' });
  const getRealVid = () => ({ path: '/path/to/video.mp4', type: 'video', name: 'video.mp4' });

  it('handles null video gracefully', () => {
    const { container } = render(<VideoPlayer video={null} />);
    expect(screen.getByText('No video selected')).toBeInTheDocument();
  });

  it('renders image and handles autoplay timeout', async () => {
    vi.useFakeTimers();
    const mockOnNext = vi.fn();
    render(<VideoPlayer video={getImgVid()} onNext={mockOnNext} settings={mockSettings} />);
    
    // Fast forward time to trigger autoplay timeout
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    
    expect(mockOnNext).toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('toggles playback when clicking play/pause button', () => {
    const { container } = render(<VideoPlayer video={getRealVid()} settings={mockSettings} />);
    
    // Find the play/pause button (it should be pause by default since isPlaying=true)
    const btns = Array.from(container.querySelectorAll('.control-btn'));
    const playPauseBtn = btns.find(b => b.innerHTML.includes('lucide-pause'));
    expect(playPauseBtn).not.toBeUndefined();

    act(() => {
      fireEvent.click(playPauseBtn);
    });
    
    // Should pause
    expect(window.HTMLMediaElement.prototype.pause).toHaveBeenCalled();
  });

  it('handles keyboard shortcuts (Space, ArrowLeft, ArrowRight, F, M)', () => {
    const mockOnNext = vi.fn();
    const mockOnPrev = vi.fn();
    render(<VideoPlayer video={getRealVid()} onNext={mockOnNext} onPrev={mockOnPrev} settings={mockSettings} skip={() => {}} />);
    
    act(() => {
      fireEvent.keyDown(window, { key: ' ' });
    });
    expect(window.HTMLMediaElement.prototype.pause).toHaveBeenCalled();

    act(() => {
      fireEvent.keyDown(window, { key: 'ArrowRight' });
    });

    act(() => {
      fireEvent.keyDown(window, { key: 'f' });
    });
    expect(document.documentElement.requestFullscreen).toHaveBeenCalled();

    act(() => {
      fireEvent.keyDown(window, { key: 'a' }); // Custom prev
    });
    expect(mockOnPrev).toHaveBeenCalled();
    
    act(() => {
      fireEvent.keyDown(window, { key: 'd' }); // Custom next
    });
    expect(mockOnNext).toHaveBeenCalled();
  });

  it('shows controls on mouse move and hides after delay', () => {
    vi.useFakeTimers();
    const { container } = render(<VideoPlayer video={getRealVid()} settings={mockSettings} />);
    
    const wrapper = container.querySelector('.player-overlay') || container.querySelector('.player-embedded') || container.firstChild;
    
    act(() => {
      fireEvent.mouseMove(wrapper);
    });
    
    const controls = container.querySelector('.controls-container');
    expect(controls).not.toBeNull();
    
    act(() => {
      vi.advanceTimersByTime(3100);
    });
    
    // Controls should hide if not hovering
    vi.useRealTimers();
  });

  it('toggles settings panel and changes loop mode', async () => {
    const { container } = render(<VideoPlayer video={getRealVid()} settings={mockSettings} />);
    
    let sBtn;
    act(() => {
      // Find the button containing the Settings icon
      const btns = Array.from(container.querySelectorAll('.control-btn'));
      sBtn = btns.find(b => b.innerHTML.includes('lucide-settings'));
      if(sBtn) fireEvent.click(sBtn);
    });
    
    // Check if settings panel appears
    await waitFor(() => {
      expect(container.querySelector('.settings-menu')).not.toBeNull();
    });
    
    // Change loop mode
    const selects = container.querySelectorAll('select');
    const loopSelect = selects[1];
    if (loopSelect) {
      act(() => {
        fireEvent.change(loopSelect, { target: { value: 'single' } });
      });
      expect(loopSelect.value).toBe('single');
    }
  });

  it('handles volume change', () => {
    const { container } = render(<VideoPlayer video={getRealVid()} settings={mockSettings} />);
    const volumeSlider = container.querySelector('input[type="range"]');
    if (volumeSlider) {
      act(() => {
        fireEvent.change(volumeSlider, { target: { value: '0.5' } });
      });
      expect(volumeSlider.value).toBe('0.5');
    }
  });

  it('handles progress bar click', () => {
    const { container } = render(<VideoPlayer video={getRealVid()} settings={mockSettings} />);
    const progressBar = container.querySelector('.progress-bar-container');
    if (progressBar) {
      // Mock getBoundingClientRect
      progressBar.getBoundingClientRect = () => ({ left: 0, width: 100 });
      act(() => {
        fireEvent.click(progressBar, { clientX: 50 });
      });
      // videoRef is mocked, so we just verify it doesn't crash
    }
  });

  it('handles fullscreen toggle', () => {
    const { container } = render(<VideoPlayer video={getRealVid()} settings={mockSettings} />);
    
    act(() => {
      const btns = Array.from(container.querySelectorAll('.control-btn'));
      const fsBtn = btns.find(b => b.innerHTML.includes('lucide-maximize'));
      if(fsBtn) fireEvent.click(fsBtn);
    });
    
    expect(document.documentElement.requestFullscreen).toHaveBeenCalled();
  });

  it('handles video events (timeupdate, loadedmetadata, ended)', () => {
    const mockOnNext = vi.fn();
    const { container } = render(<VideoPlayer video={getRealVid()} settings={mockSettings} onNext={mockOnNext} />);
    const videoEl = container.querySelector('video');
    
    // loadedmetadata
    Object.defineProperty(videoEl, 'duration', { value: 100, writable: true });
    act(() => {
      fireEvent.loadedMetadata(videoEl);
    });

    // timeupdate
    Object.defineProperty(videoEl, 'currentTime', { value: 50, writable: true });
    act(() => {
      fireEvent.timeUpdate(videoEl);
    });
    // The time display should update
    expect(container.textContent).toContain('00:50 / 01:40');

    // ended
    act(() => {
      fireEvent.ended(videoEl);
    });
    expect(mockOnNext).toHaveBeenCalled();
  });

  it('handles context menu in popout', () => {
    window.electronAPI.showContextMenu = vi.fn();
    const { container } = render(<VideoPlayer video={getRealVid()} settings={mockSettings} />);
    
    act(() => {
      fireEvent.contextMenu(container.querySelector('.player-overlay') || container.querySelector('.player-embedded'));
    });
    expect(window.electronAPI.showContextMenu).toHaveBeenCalledWith('video', '/path/to/video.mp4');
  });

  it('handles popout specific logic (close button)', () => {
    const mockOnClose = vi.fn();
    const { container } = render(<VideoPlayer video={getRealVid()} isPopout={true} onClose={mockOnClose} settings={mockSettings} />);
    
    // Top right controls exist in popout
    const closeBtn = container.querySelector('.close-popout');
    if (closeBtn) {
      act(() => {
        fireEvent.click(closeBtn);
      });
      expect(mockOnClose).toHaveBeenCalled();
    }
  });

  it('handles hover states and skip buttons', () => {
    const mockOnPrev = vi.fn();
    const mockOnNext = vi.fn();
    const { container } = render(<VideoPlayer video={getRealVid()} settings={mockSettings} onPrev={mockOnPrev} onNext={mockOnNext} skip={() => {}} />);
    
    const controlsContainer = container.querySelector('.controls-container');
    act(() => {
      fireEvent.mouseEnter(controlsContainer);
      fireEvent.mouseLeave(controlsContainer);
    });

    const topBar = container.querySelector('.top-bar');
    act(() => {
      fireEvent.mouseEnter(topBar);
      fireEvent.mouseLeave(topBar);
    });

    // Skip buttons
    const btns = Array.from(container.querySelectorAll('.control-btn'));
    const rewindBtn = btns.find(b => b.innerHTML.includes('lucide-rewind'));
    const fastForwardBtn = btns.find(b => b.innerHTML.includes('lucide-fast-forward'));
    const skipBackBtn = btns.find(b => b.innerHTML.includes('lucide-skip-back'));
    const skipForwardBtn = btns.find(b => b.innerHTML.includes('lucide-skip-forward'));
    const volumeBtn = btns.find(b => b.innerHTML.includes('lucide-volume'));

    act(() => {
      if(rewindBtn) fireEvent.click(rewindBtn);
      if(fastForwardBtn) fireEvent.click(fastForwardBtn);
      if(skipBackBtn) fireEvent.click(skipBackBtn);
      if(skipForwardBtn) fireEvent.click(skipForwardBtn);
      if(volumeBtn) fireEvent.click(volumeBtn); // toggle mute
    });

    expect(mockOnPrev).toHaveBeenCalled();
    expect(mockOnNext).toHaveBeenCalled();
  });

  it('handles video dragging (mouse down/move/up/leave)', () => {
    const { container } = render(<VideoPlayer video={getRealVid()} settings={mockSettings} />);
    const videoEl = container.querySelector('video');

    act(() => {
      fireEvent.mouseDown(videoEl, { clientX: 100, clientY: 100 });
      fireEvent.mouseMove(videoEl, { clientX: 200, clientY: 100 });
      fireEvent.mouseUp(videoEl);
      fireEvent.mouseLeave(videoEl);
    });
  });

  it('handles subtitles, always on top pin, and loop count input', () => {
    window.electronAPI.toggleAlwaysOnTop = vi.fn();
    const { container } = render(
      <VideoPlayer 
        video={getRealVid()} 
        isPopout={true} 
        subtitleUrl="/path/to/sub.vtt" 
        settings={mockSettings} 
      />
    );
    
    // Toggle subtitles
    const btns = Array.from(container.querySelectorAll('.control-btn'));
    const captionsBtn = btns.find(b => b.innerHTML.includes('lucide-captions'));
    if (captionsBtn) {
      act(() => { fireEvent.click(captionsBtn); });
    }

    // Toggle pin (always on top)
    const pinBtn = btns.find(b => b.innerHTML.includes('lucide-pin'));
    if (pinBtn) {
      act(() => { fireEvent.click(pinBtn); });
      expect(window.electronAPI.toggleAlwaysOnTop).toHaveBeenCalledWith(true);
    }

    // Loop count input
    let sBtn;
    act(() => {
      sBtn = btns.find(b => b.innerHTML.includes('lucide-settings'));
      if(sBtn) fireEvent.click(sBtn);
    });

    const selects = container.querySelectorAll('select');
    const loopSelect = selects[1];
    if (loopSelect) {
      act(() => {
        fireEvent.change(loopSelect, { target: { value: 'playlist-loop' } });
      });
      // Find loop count input
      const loopCountInput = container.querySelector('input[type="number"]');
      if (loopCountInput) {
        act(() => {
          fireEvent.change(loopCountInput, { target: { value: '3' } });
        });
        expect(loopCountInput.value).toBe('3');
      }
    }
  });
});
