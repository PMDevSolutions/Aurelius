---
name: react-performance-optimization
description: Performance profiling and optimization for React applications. Covers React Profiler, bundle analysis, code splitting, memoization patterns, image optimization, Core Web Vitals, and server-side rendering performance. Keywords: performance, bundle size, code splitting, web vitals, profiling, React.memo, useMemo, useCallback, lazy loading, LCP, INP, CLS
---

# React Performance Optimization

## Overview

This skill provides a systematic approach to identifying and resolving performance issues in React applications. It covers profiling tools, bundle optimization, rendering optimization, asset loading, and Core Web Vitals improvement.

**Core Principle:** Measure first, optimize second. Never apply performance optimizations speculatively. Every optimization adds complexity; only add complexity when measurements show a real problem.

## When to Use

Use this skill when:
- Application feels slow or janky
- Bundle size is too large (over 200KB gzipped for initial load)
- Core Web Vitals scores are below thresholds
- Components re-render too frequently
- Page load time exceeds 3 seconds
- Lighthouse Performance score is below 80

**Trigger phrases:**
- "Optimize performance"
- "Reduce bundle size"
- "Fix slow rendering"
- "Improve web vitals"
- "Profile this component"
- "Code split this route"
- "Why is this component slow"

## Profiling Tools

### React DevTools Profiler

The primary tool for identifying unnecessary re-renders and slow components.

**How to profile:**
1. Open React DevTools > Profiler tab
2. Click "Record"
3. Interact with the application (the specific flow that feels slow)
4. Click "Stop"
5. Analyze the flamegraph

**What to look for:**
- Components that render when they should not (gray = did not render, colored = rendered)
- Components with high "self time" (the component's own rendering cost, excluding children)
- Cascading re-renders (a parent change causing deep tree re-renders)

**Ranked chart view:** Shows components sorted by render time. Focus on the top entries.

### React Profiler Component (Programmatic)

```typescript
import { Profiler, type ProfilerOnRenderCallback } from "react";

const onRender: ProfilerOnRenderCallback = (id, phase, actualDuration) => {
  if (actualDuration > 16) {
    // Longer than one frame at 60fps
    console.warn(`Slow render: ${id} (${phase}) took ${actualDuration.toFixed(2)}ms`);
  }
};

function App() {
  return (
    <Profiler id="App" onRender={onRender}>
      <MainContent />
    </Profiler>
  );
}
```

### Chrome DevTools Performance Tab

For measuring overall page performance beyond React:
1. Open DevTools > Performance
2. Click Record, perform the action, click Stop
3. Analyze the Main thread timeline for long tasks (> 50ms)
4. Look for Layout Thrashing (forced synchronous layouts)

## Bundle Analysis

### Analyzing Bundle Size

```bash
# Vite: use rollup-plugin-visualizer
pnpm add -D rollup-plugin-visualizer

# Next.js: use @next/bundle-analyzer
pnpm add -D @next/bundle-analyzer
```

**Vite configuration:**
```typescript
// vite.config.ts
import { visualizer } from "rollup-plugin-visualizer";

export default defineConfig({
  plugins: [
    react(),
    visualizer({
      open: true,
      gzipSize: true,
      brotliSize: true,
      filename: "bundle-report.html",
    }),
  ],
});
```

**Next.js configuration:**
```typescript
// next.config.ts
import withBundleAnalyzer from "@next/bundle-analyzer";

const config = withBundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
})({
  // next config
});

export default config;
```

```bash
# Generate report
ANALYZE=true pnpm build
```

### Bundle Size Budgets

| Category | Budget (gzipped) |
|----------|------------------|
| Initial JS (first load) | < 100KB |
| Per-route JS | < 50KB |
| Total CSS | < 50KB |
| Individual dependency | < 30KB |
| Total first load (JS + CSS) | < 200KB |

### Common Large Dependencies and Alternatives

| Heavy Library | Size | Lighter Alternative | Size |
|--------------|------|---------------------|------|
| moment.js | 72KB | date-fns (tree-shakeable) | 2-10KB |
| lodash (full) | 72KB | lodash-es (tree-shakeable) | 2-5KB |
| chart.js | 60KB | lightweight-charts or visx | Varies |
| react-icons (full) | 40KB+ | Import individual icons | < 1KB |
| axios | 13KB | fetch (built-in) | 0KB |

**Check dependency size before installing:**
```bash
# Check size of a package (queries the bundlephobia.com API, needs network)
npx bundle-phobia-cli@0.15.0 package-name
```

## Code Splitting

### Route-Based Splitting with React.lazy

```typescript
import { lazy, Suspense } from "react";

// Each lazy import creates a separate chunk
const Dashboard = lazy(() => import("@/pages/dashboard"));
const Settings = lazy(() => import("@/pages/settings"));
const Analytics = lazy(() => import("@/pages/analytics"));

function App() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Routes>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/analytics" element={<Analytics />} />
      </Routes>
    </Suspense>
  );
}
```

### Component-Level Splitting

Split heavy components that are not always visible:

```typescript
const HeavyEditor = lazy(() => import("@/components/rich-text-editor"));
const ChartDashboard = lazy(() => import("@/components/chart-dashboard"));

function ArticlePage({ article }: { article: Article }) {
  const [isEditing, setIsEditing] = useState(false);

  return (
    <div>
      <article>{article.content}</article>
      {isEditing && (
        <Suspense fallback={<EditorSkeleton />}>
          <HeavyEditor content={article.content} />
        </Suspense>
      )}
    </div>
  );
}
```

### Named Exports with Lazy

`React.lazy` requires default exports. For named exports, use an intermediate module:

```typescript
// Option 1: Re-export wrapper
const Chart = lazy(() =>
  import("@/components/charts").then((mod) => ({ default: mod.BarChart }))
);

// Option 2: Barrel file with default export
// components/charts/bar-chart-lazy.ts
export { BarChart as default } from "./bar-chart";
```

### Next.js Dynamic Imports

```typescript
import dynamic from "next/dynamic";

const DynamicEditor = dynamic(() => import("@/components/editor"), {
  loading: () => <EditorSkeleton />,
  ssr: false, // Disable SSR for browser-only components
});
```

## Memoization Patterns

### When to Use React.memo

**Use when:**
- A component renders frequently but its props rarely change
- The component is expensive to render (large DOM tree, complex calculations)
- The parent re-renders often for reasons unrelated to this child

**Do NOT use when:**
- Props change on every render (memoization overhead with no benefit)
- The component is cheap to render (a few DOM elements)
- You have not measured a performance problem

```typescript
import { memo } from "react";

interface ExpensiveListProps {
  items: Item[];
  onSelect: (id: string) => void;
}

const ExpensiveList = memo(function ExpensiveList({ items, onSelect }: ExpensiveListProps) {
  return (
    <ul>
      {items.map((item) => (
        <li key={item.id} onClick={() => onSelect(item.id)}>
          <ExpensiveItemRenderer item={item} />
        </li>
      ))}
    </ul>
  );
});
```

### When to Use useMemo

**Use when:**
- Computing a derived value that is expensive (sorting/filtering large arrays, complex calculations)
- Creating an object/array that is passed as a prop to a memoized child

**Do NOT use when:**
- The computation is trivial (simple arithmetic, string concatenation)
- The result is not passed to memoized children

```typescript
function ProductList({ products, filter }: Props) {
  // Good: filtering 10,000 products is expensive
  const filteredProducts = useMemo(
    () => products.filter((p) => p.category === filter).sort((a, b) => a.price - b.price),
    [products, filter]
  );

  // Bad: useMemo for trivial computation
  // const fullName = useMemo(() => `${first} ${last}`, [first, last]);
  // Just write: const fullName = `${first} ${last}`;

  return <MemoizedGrid items={filteredProducts} />;
}
```

### When to Use useCallback

**Use when:**
- Passing a callback to a memoized child component (`React.memo`)
- The callback is a dependency of a child's `useEffect`

**Do NOT use when:**
- The child is not memoized (the callback reference doesn't matter)
- The function is used only in event handlers of the current component

```typescript
function Parent() {
  const [items, setItems] = useState<Item[]>([]);

  // Good: MemoizedChild will not re-render when Parent re-renders for other reasons
  const handleDelete = useCallback((id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  }, []);

  return <MemoizedChild onDelete={handleDelete} items={items} />;
}
```

### Memoization Decision Flowchart

```
Is the component slow? (measured, not guessed)
├── No → Do nothing
└── Yes → Is it re-rendering unnecessarily?
    ├── No → Profile further (maybe the render itself is slow)
    │   └── Consider: useMemo for expensive computations
    └── Yes → Why is it re-rendering?
        ├── Parent re-renders → Wrap child in React.memo
        │   └── Props still change? → Stabilize props with useMemo/useCallback
        ├── Context changes → Split context or use context selectors
        └── Own state changes → Reduce state scope or split component
```

## Image Optimization

### Next.js Image Component

```typescript
import Image from "next/image";

// Static import (best: enables automatic optimization)
import heroImage from "@/assets/images/hero.webp";

<Image
  src={heroImage}
  alt="Hero illustration"
  priority                    // Above the fold: load immediately
  placeholder="blur"          // Show blurred placeholder during load
  sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
/>

// Remote images
<Image
  src="https://cdn.example.com/photo.jpg"
  alt="Photo"
  width={800}
  height={600}
  loading="lazy"              // Below the fold: lazy load
/>
```

### General React Image Optimization

```typescript
// Responsive images with srcset
<img
  src="/images/hero-800.webp"
  srcSet="/images/hero-400.webp 400w, /images/hero-800.webp 800w, /images/hero-1600.webp 1600w"
  sizes="(max-width: 768px) 100vw, 50vw"
  alt="Hero"
  loading="lazy"
  decoding="async"
  width={800}
  height={600}
/>

// Lazy-loaded image component
function LazyImage({ src, alt, ...props }: React.ImgHTMLAttributes<HTMLImageElement>) {
  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      decoding="async"
      {...props}
    />
  );
}
```

### Image Format Priority

1. **AVIF** -- Best compression, growing browser support
2. **WebP** -- Good compression, wide browser support
3. **JPEG** -- Fallback for photos
4. **PNG** -- Only for images requiring transparency
5. **SVG** -- For icons and illustrations (inline or as component)

## Core Web Vitals

### LCP (Largest Contentful Paint) -- Target: < 2.5s

The largest visible element (usually hero image or heading).

**Optimization strategies:**
- Preload the LCP resource: `<link rel="preload" as="image" href="hero.webp">`
- Use `priority` prop on Next.js Image for hero images
- Inline critical CSS (or use `next/font` for font optimization)
- Remove render-blocking JS from the critical path (code split)
- Use a CDN for static assets
- Server-side render the above-fold content

### INP (Interaction to Next Paint) -- Target: < 200ms

Time from user interaction to the next visual update.

**Optimization strategies:**
- Break up long tasks with `startTransition` for non-urgent updates
- Use `useTransition` for state updates that can be deferred
- Move heavy computation to Web Workers
- Debounce rapid-fire inputs (search, scroll handlers)
- Avoid synchronous layout reads in event handlers

```typescript
import { useTransition } from "react";

function SearchPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [isPending, startTransition] = useTransition();

  const handleSearch = (value: string) => {
    setQuery(value); // Urgent: update input immediately

    startTransition(() => {
      // Non-urgent: filter/search can be deferred
      setResults(filterResults(allData, value));
    });
  };

  return (
    <>
      <input value={query} onChange={(e) => handleSearch(e.target.value)} />
      {isPending ? <Spinner /> : <ResultsList results={results} />}
    </>
  );
}
```

### CLS (Cumulative Layout Shift) -- Target: < 0.1

Visual stability; elements should not shift during load.

**Optimization strategies:**
- Always set `width` and `height` on images and videos (or use `aspect-ratio`)
- Reserve space for dynamic content with skeleton placeholders
- Avoid inserting content above existing content (banners, ads)
- Use `font-display: swap` with `size-adjust` to minimize font swap shift
- Use CSS `contain: layout` on sections that load independently

```typescript
// Skeleton placeholder reserves space
function CardSkeleton() {
  return (
    <div className="h-64 w-full animate-pulse rounded-lg bg-muted" />
  );
}

function CardGrid() {
  return (
    <Suspense fallback={
      <div className="grid grid-cols-3 gap-4">
        <CardSkeleton />
        <CardSkeleton />
        <CardSkeleton />
      </div>
    }>
      <AsyncCardGrid />
    </Suspense>
  );
}
```

## Server-Side Rendering Performance

### Streaming SSR (React 19 / Next.js App Router)

```typescript
// app/page.tsx - Streaming with Suspense boundaries
import { Suspense } from "react";

export default function Page() {
  return (
    <div>
      {/* Sent immediately */}
      <Header />
      <HeroSection />

      {/* Streamed when ready */}
      <Suspense fallback={<ProductGridSkeleton />}>
        <ProductGrid />  {/* async server component */}
      </Suspense>

      <Suspense fallback={<ReviewsSkeleton />}>
        <Reviews />  {/* async server component, independent stream */}
      </Suspense>

      <Footer />
    </div>
  );
}
```

### Static Generation vs. Dynamic Rendering

```typescript
// Static: generated at build time (fastest)
// Good for: marketing pages, blog posts, documentation
export const dynamic = "force-static";

// Dynamic: rendered per-request
// Good for: personalized content, real-time data
export const dynamic = "force-dynamic";

// ISR: static with revalidation
// Good for: product pages, listings (fresh enough, fast)
export const revalidate = 3600; // Re-generate every hour
```

## Performance Checklist

Run through this checklist when optimizing:

```
[ ] Measured the problem with React Profiler / Chrome DevTools
[ ] Bundle analyzed -- no oversized dependencies
[ ] Routes are code-split with React.lazy or dynamic imports
[ ] Images use next/image or responsive srcset with lazy loading
[ ] Fonts loaded with next/font or @fontsource with display swap
[ ] Above-fold content renders without JS (SSR or static)
[ ] LCP element preloaded
[ ] No layout shift from loading content (skeletons, dimensions set)
[ ] Heavy computations use useMemo (measured, not guessed)
[ ] Memoized children receive stable props (useCallback where needed)
[ ] Non-urgent updates wrapped in startTransition
[ ] Third-party scripts loaded with async/defer or next/script
[ ] Lighthouse Performance score >= 90
```

## Common Mistakes

1. **Memoizing everything** -- `React.memo`, `useMemo`, and `useCallback` have overhead. Only use them when profiling shows a real benefit.
2. **Not setting image dimensions** -- Causes CLS. Always provide width/height or aspect-ratio.
3. **Loading all routes eagerly** -- Code-split routes you don't need on initial load.
4. **Importing entire icon libraries** -- Import individual icons: `import { Search } from "lucide-react"`, not `import * as Icons`.
5. **Using index as key in dynamic lists** -- Causes incorrect reconciliation. Use stable unique IDs.
6. **Fetching in useEffect without caching** -- Use TanStack Query or SWR for data fetching with caching, deduplication, and stale-while-revalidate.
7. **Blocking the main thread** -- Move heavy computation to Web Workers or break into smaller tasks with `requestIdleCallback`.

---

**Skill Version:** 1.0.0
**Last Updated:** 2026-03-11
