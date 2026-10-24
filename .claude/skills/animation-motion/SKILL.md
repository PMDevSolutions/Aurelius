---
name: animation-motion
description: Animation patterns for React — Framer Motion, CSS transitions, page transitions, micro-interactions, scroll-driven animations, and reduced-motion accessibility. Keywords: animation, framer motion, transition, micro-interaction, page transition, scroll animation, motion, animate
---

# Animation & Motion — React Patterns

## Decision Tree

```
What kind of animation?
├── Simple hover/focus state → CSS / Tailwind classes
├── Enter/exit animation → Framer Motion (motion.div)
├── Page transitions → AnimatePresence + layout routes
├── Scroll-driven parallax → useScroll + useTransform
├── Staggered list reveals → Framer Motion variants
├── Complex orchestrated sequences → Framer Motion variants + transition
└── Performance-critical (60fps) → CSS transitions / transforms only
```

| Approach | Best For | Bundle Impact |
|----------|----------|---------------|
| CSS / Tailwind | Hover, focus, simple transitions | Zero (built-in) |
| Framer Motion | Enter/exit, gestures, layout, orchestration | ~30 KB gzipped |
| CSS `@keyframes` | Looping animations (spinners, pulses) | Zero (built-in) |
| Web Animations API | Imperative control without library | Zero (browser API) |

---

## 1. CSS-First with Tailwind

Always start with CSS. Only reach for Framer Motion when CSS cannot handle the animation (enter/exit, layout, gesture-driven).

### Hover and Focus Transitions

```tsx
<button className="rounded-lg bg-blue-600 px-4 py-2 text-white transition-colors duration-200 hover:bg-blue-700 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2">
  Save Changes
</button>
```

### Scale on Hover

```tsx
<div className="transform transition-transform duration-200 hover:scale-105">
  <CardContent />
</div>
```

### Skeleton Loading (Pulse)

```tsx
function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-gray-200", className)}
      aria-hidden="true"
    />
  );
}

// Usage
<Skeleton className="h-4 w-48" />
<Skeleton className="h-32 w-full" />
```

### Spin Animation

```tsx
<svg
  className="animate-spin h-5 w-5 text-white"
  xmlns="http://www.w3.org/2000/svg"
  fill="none"
  viewBox="0 0 24 24"
  aria-label="Loading"
>
  <circle
    className="opacity-25"
    cx="12" cy="12" r="10"
    stroke="currentColor"
    strokeWidth="4"
  />
  <path
    className="opacity-75"
    fill="currentColor"
    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
  />
</svg>
```

---

## 2. Framer Motion Setup

```bash
pnpm add motion
```

Import from `motion/react` (not `framer-motion` — the package was renamed):

```tsx
import { motion, AnimatePresence } from "motion/react";
```

---

## 3. Basic Enter Animation

```tsx
import { motion } from "motion/react";

function FadeIn({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  );
}
```

### With TypeScript Props

```tsx
import { motion, type Variants } from "motion/react";

interface AnimatedCardProps {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}

export function AnimatedCard({
  children,
  delay = 0,
  className,
}: AnimatedCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{
        duration: 0.3,
        delay,
        ease: [0.25, 0.46, 0.45, 0.94], // easeOutQuad
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
```

---

## 4. Exit Animation with AnimatePresence

`AnimatePresence` enables exit animations when components are removed from the React tree. Required for modals, toasts, and conditional UI.

```tsx
import { motion, AnimatePresence } from "motion/react";
import { useState } from "react";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
}

export function Modal({ isOpen, onClose, children }: ModalProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/50 z-40"
            onClick={onClose}
            aria-hidden="true"
          />

          {/* Modal panel */}
          <motion.div
            key="modal"
            role="dialog"
            aria-modal="true"
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
          >
            <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
              {children}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
```

---

## 5. Staggered List Animations

Use variants with a container/item pattern for staggered reveals.

```tsx
import { motion, type Variants } from "motion/react";

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.08,
      delayChildren: 0.1,
    },
  },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.3, ease: "easeOut" },
  },
};

interface AnimatedListProps<T> {
  items: T[];
  renderItem: (item: T, index: number) => React.ReactNode;
  keyExtractor: (item: T) => string;
  className?: string;
}

export function AnimatedList<T>({
  items,
  renderItem,
  keyExtractor,
  className,
}: AnimatedListProps<T>) {
  return (
    <motion.ul
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className={className}
    >
      {items.map((item, index) => (
        <motion.li key={keyExtractor(item)} variants={itemVariants}>
          {renderItem(item, index)}
        </motion.li>
      ))}
    </motion.ul>
  );
}
```

Usage:

```tsx
<AnimatedList
  items={products}
  keyExtractor={(p) => p.id}
  renderItem={(product) => <ProductCard product={product} />}
  className="grid grid-cols-3 gap-4"
/>
```

---

## 6. Page Transitions (Next.js App Router)

Create a reusable `PageTransition` wrapper for route animations.

```tsx
// components/PageTransition.tsx
"use client";

import { motion } from "motion/react";
import { type ReactNode } from "react";

interface PageTransitionProps {
  children: ReactNode;
  className?: string;
}

export function PageTransition({ children, className }: PageTransitionProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
```

Usage in page components:

```tsx
// app/about/page.tsx
import { PageTransition } from "@/components/PageTransition";

export default function AboutPage() {
  return (
    <PageTransition>
      <h1>About</h1>
      <p>Page content here.</p>
    </PageTransition>
  );
}
```

For full enter/exit route transitions, wrap the `children` in a layout with `AnimatePresence`:

```tsx
// app/template.tsx
"use client";

import { motion, AnimatePresence } from "motion/react";
import { usePathname } from "next/navigation";
import { type ReactNode } from "react";

export default function Template({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={pathname}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
```

---

## 7. Scroll-Driven Animations

### Parallax Effect

```tsx
"use client";

import { motion, useScroll, useTransform } from "motion/react";
import { useRef } from "react";

export function ParallaxHero() {
  const ref = useRef<HTMLDivElement>(null);

  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end start"],
  });

  const backgroundY = useTransform(scrollYProgress, [0, 1], ["0%", "50%"]);
  const textY = useTransform(scrollYProgress, [0, 1], ["0%", "100%"]);
  const opacity = useTransform(scrollYProgress, [0, 0.8], [1, 0]);

  return (
    <div ref={ref} className="relative h-screen overflow-hidden">
      <motion.div
        style={{ y: backgroundY }}
        className="absolute inset-0"
      >
        <img
          src="/hero-bg.jpg"
          alt=""
          className="h-full w-full object-cover"
        />
      </motion.div>

      <motion.div
        style={{ y: textY, opacity }}
        className="relative z-10 flex h-full items-center justify-center"
      >
        <h1 className="text-6xl font-bold text-white">
          Welcome
        </h1>
      </motion.div>
    </div>
  );
}
```

### Scroll-Triggered Reveal

```tsx
"use client";

import { motion, useInView } from "motion/react";
import { useRef } from "react";

interface ScrollRevealProps {
  children: React.ReactNode;
  className?: string;
}

export function ScrollReveal({ children, className }: ScrollRevealProps) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 40 }}
      animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 40 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
```

---

## 8. Reduced Motion Accessibility (NON-NEGOTIABLE)

Every animation MUST respect the user's `prefers-reduced-motion` setting. This is not optional.

### useReducedMotion Hook

```tsx
// hooks/useReducedMotion.ts
import { useEffect, useState } from "react";

export function useReducedMotion(): boolean {
  const [prefersReduced, setPrefersReduced] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setPrefersReduced(query.matches);

    function handleChange(event: MediaQueryListEvent) {
      setPrefersReduced(event.matches);
    }

    query.addEventListener("change", handleChange);
    return () => query.removeEventListener("change", handleChange);
  }, []);

  return prefersReduced;
}
```

### Using with Framer Motion

Framer Motion has a built-in hook:

```tsx
import { useReducedMotion, motion } from "motion/react";

export function AnimatedCard({ children }: { children: React.ReactNode }) {
  const prefersReduced = useReducedMotion();

  return (
    <motion.div
      initial={{ opacity: 0, y: prefersReduced ? 0 : 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: prefersReduced ? 0 : 0.3 }}
    >
      {children}
    </motion.div>
  );
}
```

### CSS Media Query

Apply globally in your base styles:

```css
/* globals.css */
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

### Tailwind Variant

```tsx
<div className="transition-transform duration-300 hover:scale-105 motion-reduce:transition-none motion-reduce:hover:scale-100">
  <CardContent />
</div>
```

---

## 9. Performance Rules

| Rule | Reason |
|------|--------|
| Only animate `transform` and `opacity` | These are GPU-composited and run on a separate thread. They do not trigger layout or paint. |
| Never animate `width`, `height`, `top`, `left` | These trigger layout recalculations on every frame, causing jank. |
| Keep feedback animations under 300ms | Users perceive delays over 300ms as sluggish. Button presses, toggles, and micro-interactions should feel instant. |
| Keep transitions under 500ms max | Longer animations feel slow and block user flow. Page transitions and modals should complete within 500ms. |
| Use `will-change` sparingly | Only add `will-change: transform` on elements that will animate. Remove it after animation completes. Overuse wastes GPU memory. |
| Avoid animating during scroll | Scroll-driven animations should use `useTransform` (not state updates) to avoid React re-renders. |
| Use `layout` prop carefully | Framer Motion `layout` animations are powerful but trigger layout measurements. Limit to small, contained elements. |
| Prefer `AnimatePresence mode="wait"` | For page transitions, `mode="wait"` ensures the exit animation completes before the enter animation starts, preventing layout jumps. |

### Measuring Animation Performance

```tsx
// Use Chrome DevTools Performance tab:
// 1. Record during animation
// 2. Check for long frames (> 16ms)
// 3. Verify no layout thrashing in "Layout Shift" track
// 4. Confirm composited layers in "Layers" panel
```

### Animation Timing Reference

| Interaction | Duration | Easing |
|-------------|----------|--------|
| Button hover/focus | 150ms | ease-out |
| Tooltip appear | 200ms | ease-out |
| Modal open | 200-300ms | ease-out |
| Modal close | 150-200ms | ease-in |
| Page transition | 200-300ms | ease-out |
| List item stagger | 50-80ms between items | ease-out |
| Scroll reveal | 400-500ms | ease-out |
| Toast notification | 300ms enter, 200ms exit | ease-out / ease-in |
