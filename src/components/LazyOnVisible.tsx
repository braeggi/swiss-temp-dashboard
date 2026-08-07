import { useEffect, useRef, useState, type ReactNode } from 'react';

export interface LazyOnVisibleProps {
  children: ReactNode;
  /** Mount immediately, bypassing the intersection check — used for a legacy-link jump target. */
  forceVisible?: boolean;
  /** How far before entering the viewport to mount. A comfortable one-screen lookahead. */
  rootMargin?: string;
}

/**
 * Defers mounting its children until they are about to scroll into view.
 *
 * The answer layer must not wait on Recharts to load, so each evidence
 * section is its own lazily-imported chunk (see the `React.lazy` calls in
 * App.tsx); this is the gate that keeps the browser from fetching all three
 * chunks the moment the page opens. Falls back to mounting immediately where
 * IntersectionObserver does not exist, so nothing is ever permanently hidden.
 */
export function LazyOnVisible({ children, forceVisible = false, rootMargin = '200px' }: LazyOnVisibleProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(
    forceVisible || typeof IntersectionObserver === 'undefined',
  );

  useEffect(() => {
    if (visible || ref.current === null) return;
    const el = ref.current;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [visible, rootMargin]);

  useEffect(() => {
    if (forceVisible) setVisible(true);
  }, [forceVisible]);

  return (
    <div ref={ref} style={visible ? undefined : { minHeight: '420px' }}>
      {visible ? children : null}
    </div>
  );
}
