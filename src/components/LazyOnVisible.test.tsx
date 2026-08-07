// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LazyOnVisible } from './LazyOnVisible';

class FakeIntersectionObserver {
  static instances: FakeIntersectionObserver[] = [];
  callback: IntersectionObserverCallback;
  observe = vi.fn();
  disconnect = vi.fn();
  unobserve = vi.fn();
  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback;
    FakeIntersectionObserver.instances.push(this);
  }
  trigger(isIntersecting: boolean) {
    this.callback(
      [{ isIntersecting } as IntersectionObserverEntry],
      this as unknown as IntersectionObserver,
    );
  }
}

describe('LazyOnVisible', () => {
  afterEach(() => {
    FakeIntersectionObserver.instances = [];
    // @ts-expect-error test cleanup — restoring to "not present" between tests
    delete global.IntersectionObserver;
  });

  it('does not render children until the observer reports intersection', () => {
    // @ts-expect-error test stub
    global.IntersectionObserver = FakeIntersectionObserver;
    render(
      <LazyOnVisible>
        <p>chart content</p>
      </LazyOnVisible>,
    );
    expect(screen.queryByText('chart content')).not.toBeInTheDocument();

    act(() => {
      FakeIntersectionObserver.instances[0].trigger(true);
    });
    expect(screen.getByText('chart content')).toBeInTheDocument();
  });

  it('does not render children while the observer reports no intersection', () => {
    // @ts-expect-error test stub
    global.IntersectionObserver = FakeIntersectionObserver;
    render(
      <LazyOnVisible>
        <p>chart content</p>
      </LazyOnVisible>,
    );
    act(() => {
      FakeIntersectionObserver.instances[0].trigger(false);
    });
    expect(screen.queryByText('chart content')).not.toBeInTheDocument();
  });

  it('mounts immediately when forceVisible is set', () => {
    // @ts-expect-error test stub
    global.IntersectionObserver = FakeIntersectionObserver;
    render(
      <LazyOnVisible forceVisible>
        <p>jump target</p>
      </LazyOnVisible>,
    );
    expect(screen.getByText('jump target')).toBeInTheDocument();
  });

  it('mounts immediately when IntersectionObserver does not exist', () => {
    render(
      <LazyOnVisible>
        <p>fallback content</p>
      </LazyOnVisible>,
    );
    expect(screen.getByText('fallback content')).toBeInTheDocument();
  });

  it('reserves layout height while hidden, to avoid all placeholders intersecting at once', () => {
    // @ts-expect-error test stub
    global.IntersectionObserver = FakeIntersectionObserver;
    const { container } = render(
      <LazyOnVisible>
        <p>chart content</p>
      </LazyOnVisible>,
    );
    expect(container.firstElementChild).toHaveStyle({ minHeight: '420px' });
  });
});
