import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import VideoPlayer from '../components/VideoPlayer';

describe('VideoPlayer Component', () => {
  const mockSettings = { imageAutoplaySeconds: 5 };
  
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders an image element when video type is image', () => {
    const video = { path: '/path/to/image.jpg', type: 'image', name: 'image.jpg' };
    
    const { container } = render(
      <VideoPlayer 
        video={video} 
        playlist={[video]} 
        settings={mockSettings}
      />
    );

    const img = container.querySelector('img');
    expect(img).not.toBeNull();
    expect(img.src).toContain('file:///path/to/image.jpg');
    
    // Video element should not exist
    const vid = container.querySelector('video');
    expect(vid).toBeNull();
  });

  it('renders a video element when video type is video', () => {
    const video = { path: '/path/to/video.mp4', type: 'video', name: 'video.mp4' };
    
    const { container } = render(
      <VideoPlayer 
        video={video} 
        playlist={[video]} 
        settings={mockSettings}
      />
    );

    const vid = container.querySelector('video');
    expect(vid).not.toBeNull();
    expect(vid.src).toContain('file:///path/to/video.mp4');
    
    // Image element should not exist
    const img = container.querySelector('img');
    expect(img).toBeNull();
  });

  it('calls play on video element when switching from image to video', () => {
    const imgVid = { path: '/path/to/image.jpg', type: 'image', name: 'image.jpg' };
    const realVid = { path: '/path/to/video.mp4', type: 'video', name: 'video.mp4' };
    
    const { container, rerender } = render(
      <VideoPlayer 
        video={imgVid} 
        playlist={[imgVid, realVid]} 
        settings={mockSettings}
      />
    );

    // Assert it started with an image
    expect(container.querySelector('img')).not.toBeNull();

    // Rerender with the video
    rerender(
      <VideoPlayer 
        video={realVid} 
        playlist={[imgVid, realVid]} 
        settings={mockSettings}
      />
    );

    // Wait for the useEffect to trigger the `.play()` method
    const vid = container.querySelector('video');
    expect(vid).not.toBeNull();
    expect(window.HTMLMediaElement.prototype.play).toHaveBeenCalled();
  });

  it('handles null video gracefully (popout mode defense)', () => {
    const { container } = render(
      <VideoPlayer 
        video={null} 
        playlist={[]} 
        settings={mockSettings}
        isPopout={true}
      />
    );
    
    expect(screen.getByText('No video selected')).toBeInTheDocument();
  });
});
