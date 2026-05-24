import React, { useState } from 'react';

export default function Pagination({ 
  totalPages, 
  currentPageIndex, 
  setCurrentPageIndex 
}) {
  const [jumpPageInput, setJumpPageInput] = useState('');

  if (totalPages <= 1) return null;

  const getPageNumbers = () => {
    const pages = [];
    if (totalPages <= 7) {
      for (let i = 0; i < totalPages; i++) pages.push(i);
    } else {
      if (currentPageIndex <= 3) {
        pages.push(0, 1, 2, 3, 4, '...', totalPages - 1);
      } else if (currentPageIndex >= totalPages - 4) {
        pages.push(0, '...', totalPages - 5, totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1);
      } else {
        pages.push(0, '...', currentPageIndex - 1, currentPageIndex, currentPageIndex + 1, '...', totalPages - 1);
      }
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
            onClick={() => setCurrentPageIndex(page)}
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
