import React, { useState, useEffect } from 'react';

export default function Pagination({
  maxVisiblePages = 7, 
  totalPages, 
  currentPageIndex, 
  setCurrentPageIndex
}) {
  const [jumpPageInput, setJumpPageInput] = useState('');
  const [lastClickedPage, setLastClickedPage] = useState(null);

  useEffect(() => {
    if (lastClickedPage !== null && lastClickedPage === currentPageIndex) {
      const nextPageIndex = currentPageIndex + 1;
      if (nextPageIndex < totalPages) {
        // Try to focus the button for the next page
        const btns = document.querySelectorAll('.pagination-controls button.btn');
        const targetText = String(nextPageIndex + 1);
        for (const btn of btns) {
          if (btn.innerText === targetText) {
            btn.focus({ preventScroll: true });
            break;
          }
        }
      }
      setLastClickedPage(null);
    }
  }, [currentPageIndex, totalPages, lastClickedPage]);

  const handlePageClick = (page) => {
    setLastClickedPage(page);
    setCurrentPageIndex(page);
  };

  if (totalPages <= 1) return null;

  const getPageNumbers = () => {
    const pages = [];
    const maxItems = maxVisiblePages || 7;
    
    if (totalPages <= maxItems) {
      for (let i = 0; i < totalPages; i++) pages.push(i);
      return pages;
    }

    const leftBound = Math.floor(maxItems / 2);
    const rightBound = totalPages - Math.floor(maxItems / 2);

    if (currentPageIndex <= leftBound) {
      const end = maxItems - 2; 
      for (let i = 0; i < end; i++) pages.push(i);
      pages.push('...', totalPages - 1);
    } else if (currentPageIndex >= rightBound - 1) {
      pages.push(0, '...');
      const start = totalPages - (maxItems - 2);
      for (let i = start; i < totalPages; i++) pages.push(i);
    } else {
      pages.push(0, '...');
      const midPages = Math.max(1, maxItems - 4);
      const midStart = currentPageIndex - Math.floor(midPages / 2);
      for (let i = 0; i < midPages; i++) {
        pages.push(midStart + i);
      }
      pages.push('...', totalPages - 1);
    }
    return pages;
  };

  return (
    <div className="pagination-controls no-drag">
      <button className="btn" style={{ padding: '8px 12px' }} disabled={currentPageIndex === 0} onClick={() => setCurrentPageIndex(p => p - 1)}>&lt;</button>
      {getPageNumbers().map((page, idx) => (
        page === '...' ? (
          <span key={`ellipsis-${idx}`} style={{ color: 'var(--text-secondary)', padding: '0 4px' }}>...</span>
        ) : (
          <button
            key={page}
            className={`btn ${currentPageIndex === page ? 'active' : ''}`}
            style={{ padding: '8px 14px' }}
            onClick={() => handlePageClick(page)}
          >
            {page + 1}
          </button>
        )
      ))}
      <button className="btn" style={{ padding: '8px 12px' }} disabled={currentPageIndex === totalPages - 1} onClick={() => setCurrentPageIndex(p => p + 1)}>&gt;</button>
      <div style={{ display: 'flex', alignItems: 'center', marginLeft: '16px', borderLeft: '1px solid rgba(255,255,255,0.1)', paddingLeft: '16px' }}>
        <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginRight: '8px' }}>跳轉:</span>
        <input 
          type="number" 
          min="1" max={totalPages}
          style={{ width: '60px', padding: '6px 10px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(0,0,0,0.3)', color: 'white', outline: 'none' }}
          value={jumpPageInput}
          placeholder={currentPageIndex + 1}
          onChange={e => setJumpPageInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              const page = parseInt(jumpPageInput)
              if (!isNaN(page) && page >= 1 && page <= totalPages) {
                setCurrentPageIndex(page - 1)
                setJumpPageInput('')
              }
            }
          }}
        />
      </div>
    </div>
  );
}
