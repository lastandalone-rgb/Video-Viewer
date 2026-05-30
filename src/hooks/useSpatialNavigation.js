import { useEffect, useCallback } from 'react';

const FOCUSABLE_SELECTOR = 'button:not([disabled]), a, input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';


window.getScrollParent = (node) => {
  if (node == null || node === document.body) return null;
  if (node.scrollHeight > node.clientHeight) {
    const overflowY = window.getComputedStyle(node).overflowY;
    if (overflowY === 'auto' || overflowY === 'scroll') return node;
  }
  return window.getScrollParent(node.parentNode);
};
const getScrollParent = window.getScrollParent;

export function useSpatialNavigation() {
  const getNavigableElements = () => {
    const elements = Array.from(document.querySelectorAll(FOCUSABLE_SELECTOR));
    return elements.filter(el => {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return false;
      const style = window.getComputedStyle(el);
      return style.visibility !== 'hidden' && style.display !== 'none' && style.opacity !== '0';
    });
  };

  const handleKeyDown = useCallback((e) => {
    const activeEl = document.activeElement;
    const isTextInput = activeEl && (
      (activeEl.tagName === 'INPUT' && !['checkbox', 'radio', 'range', 'button'].includes(activeEl.type)) || 
      activeEl.tagName === 'TEXTAREA' || 
      activeEl.isContentEditable
    );
    
    if (isTextInput) return;

    const key = e.key.toLowerCase();
    
    if (key === 'x') {
      // If there is any active video player globally, X should ALWAYS close the player.
      // We don't want a stray activeElement (e.g. user accidentally clicked outside the player) 
      // to intercept X and trigger a different action.
      const isPlayerOpen = document.querySelector('.player-embedded, .player-overlay, .theatre-player-wrapper');
      if (isPlayerOpen) {
        return; // Do not intercept, let the event propagate so VideoPlayer's global listener handles it
      }

      // If we are focused on an interactive element, act as click
      const isInteractive = activeEl && (
        activeEl.tagName === 'BUTTON' || 
        activeEl.tagName === 'A' || 
        (activeEl.hasAttribute('tabindex') && activeEl.getAttribute('tabindex') !== '-1')
      ) && activeEl.tagName !== 'BODY';

      if (isInteractive && typeof activeEl.click === 'function') {
        e.preventDefault();
        e.stopPropagation();
        activeEl.click();
      }
      return; // If not interactive, let the event propagate
    }

    if (['w', 'a', 's', 'd'].includes(key)) {
      e.preventDefault();
      e.stopPropagation();
      const elements = getNavigableElements();
      if (elements.length === 0) return;

      if (!activeEl || activeEl === document.body || !elements.includes(activeEl)) {
        elements[0].focus({ preventScroll: true });
        document.body.classList.add('spatial-nav-active');
        return;
      }

      const activeRect = activeEl.getBoundingClientRect();
      const activeCenter = { x: activeRect.left + activeRect.width / 2, y: activeRect.top + activeRect.height / 2 };
      const activeScrollParent = getScrollParent(activeEl);
      
      let bestMatch = null;
      let minScore = Infinity;

      elements.forEach(el => {
        if (el === activeEl) return;
        const rect = el.getBoundingClientRect();
        const elCenter = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
        
        let isValidDirection = false;
        const tolerance = 5; 
        
        if (key === 'w' && elCenter.y <= activeCenter.y - tolerance) isValidDirection = true;
        if (key === 's' && elCenter.y >= activeCenter.y + tolerance) isValidDirection = true;
        if (key === 'a' && elCenter.x <= activeCenter.x - tolerance) isValidDirection = true;
        if (key === 'd' && elCenter.x >= activeCenter.x + tolerance) isValidDirection = true;

        if (isValidDirection) {
          const dx = Math.abs(activeCenter.x - elCenter.x);
          const dy = Math.abs(activeCenter.y - elCenter.y);
          
          let primaryDist;
          let secondaryDist;

          if (key === 'w' || key === 's') {
            primaryDist = dy;
            secondaryDist = dx;
          } else {
            primaryDist = dx;
            secondaryDist = dy;
          }

          let score = primaryDist + (secondaryDist * 3);
          
          const elScrollParent = window.getScrollParent(el);
          if (activeScrollParent && elScrollParent !== activeScrollParent) {
            score += 10000;
          }
          
          // Penalize vertical jumps across side-by-side regions (e.g. main vs sidebar)
          const isElInSidebar = el.closest('.sidebar') !== null;
          const isActiveInSidebar = activeEl.closest('.sidebar') !== null;
          if (isElInSidebar !== isActiveInSidebar && (key === 'w' || key === 's')) {
            score += 50000;
          }

          if (score < minScore) {
            minScore = score;
            bestMatch = el;
          }
        }
      });

      console.log('WASD pressed', key, 'activeScrollParent:', activeScrollParent, 'bestMatch:', bestMatch);
      if (bestMatch) {
        bestMatch.focus({ preventScroll: true });
        document.body.classList.add('spatial-nav-active');
        bestMatch.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
        
        const bestMatchScrollParent = window.getScrollParent(bestMatch);
        
        // If we are jumping out of the scroll container
        if (activeScrollParent && bestMatchScrollParent !== activeScrollParent) {
          if (key === 's') activeScrollParent.scrollTo({ top: activeScrollParent.scrollHeight, behavior: 'smooth' });
          if (key === 'w') activeScrollParent.scrollTo({ top: 0, behavior: 'smooth' });
        } 
        // If we are staying in the scroll container, check if it's the last/first row
        else if (bestMatchScrollParent) {
          const bestMatchRect = bestMatch.getBoundingClientRect();
          const hasElementsBelow = elements.some(el => 
            el !== bestMatch && window.getScrollParent(el) === bestMatchScrollParent && el.getBoundingClientRect().top > bestMatchRect.top + 5
          );
          const hasElementsAbove = elements.some(el => 
            el !== bestMatch && window.getScrollParent(el) === bestMatchScrollParent && el.getBoundingClientRect().top < bestMatchRect.top - 5
          );
          
          if (!hasElementsBelow && key === 's') {
            bestMatchScrollParent.scrollTo({ top: bestMatchScrollParent.scrollHeight, behavior: 'smooth' });
          } else if (!hasElementsAbove && key === 'w') {
            bestMatchScrollParent.scrollTo({ top: 0, behavior: 'smooth' });
          }
        }
      } else if (activeScrollParent) {
        // New requirement: if no element in that direction, scroll to the extreme
        if (key === 's') activeScrollParent.scrollTo({ top: activeScrollParent.scrollHeight, behavior: 'smooth' });
        if (key === 'w') activeScrollParent.scrollTo({ top: 0, behavior: 'smooth' });
        if (key === 'a') activeScrollParent.scrollTo({ left: 0, behavior: 'smooth' });
        if (key === 'd') activeScrollParent.scrollTo({ left: activeScrollParent.scrollWidth, behavior: 'smooth' });
      }
    }
  }, []);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown, { capture: true });
    
    const handleMouseMove = () => {
      document.body.classList.remove('spatial-nav-active');
    };
    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown, { capture: true });
      window.removeEventListener('mousemove', handleMouseMove);
    };
  }, [handleKeyDown]);
}
