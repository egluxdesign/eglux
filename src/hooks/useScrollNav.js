// src/hooks/useScrollNav.js
import { useEffect, useRef, useState } from 'react';

export function useScrollNav() {
  const [isStuck, setIsStuck] = useState(false);
  const [isPrimaryHidden, setIsPrimaryHidden] = useState(false);

  const primaryNavRef = useRef(null);
  const duplicateNavRef = useRef(null);
  const headerRef = useRef(null);

  const duplicateNavOffsetRef = useRef(0);
  const isStuckRef = useRef(false);
  const isPrimaryHiddenRef = useRef(false);
  const tickingRef = useRef(false);

  useEffect(() => {
    const primaryNav = primaryNavRef.current;
    const duplicateNav = duplicateNavRef.current;
    const header = headerRef.current;

    if (!primaryNav || !duplicateNav || !header) return;

    const updateOffsets = () => {
      const rect = duplicateNav.getBoundingClientRect();
      duplicateNavOffsetRef.current = rect.top + window.scrollY;
    };

    const onScroll = () => {
      const scrollY = window.scrollY;
      const headerHeight = header.offsetHeight;
      const triggerPoint = duplicateNavOffsetRef.current - headerHeight;

      // Primary nav: smooth slide-up hide when scrolled past
      const primaryNavRect = primaryNav.getBoundingClientRect();
      const shouldHidePrimary = primaryNavRect.bottom <= 0;

      if (shouldHidePrimary !== isPrimaryHiddenRef.current) {
        isPrimaryHiddenRef.current = shouldHidePrimary;
        setIsPrimaryHidden(shouldHidePrimary);
      }

      // Duplicate nav: only stick when it actually reaches the logo bar
      const shouldStick = scrollY >= triggerPoint;

      if (shouldStick !== isStuckRef.current) {
        isStuckRef.current = shouldStick;
        setIsStuck(shouldStick);
      }

      tickingRef.current = false;
    };

    const onScrollThrottled = () => {
      if (!tickingRef.current) {
        requestAnimationFrame(onScroll);
        tickingRef.current = true;
      }
    };

    // Init offsets
    updateOffsets();

    window.addEventListener('load', updateOffsets);
    window.addEventListener('resize', updateOffsets);
    window.addEventListener('scroll', onScrollThrottled, { passive: true });

    return () => {
      window.removeEventListener('load', updateOffsets);
      window.removeEventListener('resize', updateOffsets);
      window.removeEventListener('scroll', onScrollThrottled);
    };
  }, []);

  return {
    primaryNavRef,
    duplicateNavRef,
    headerRef,
    isStuck,
    isPrimaryHidden,
  };
}