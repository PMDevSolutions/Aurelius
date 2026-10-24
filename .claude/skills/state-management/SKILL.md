---
name: state-management
description: State management patterns for React apps — Zustand, TanStack Query, Context, URL state. Guides architecture decisions for local, global, server, and URL state. Keywords: state management, zustand, tanstack query, react query, global state, server state, data fetching, caching
---

# State Management Patterns

## When to Use This Skill

Use when:
- Setting up state management for a new React app
- Deciding between state solutions
- Implementing data fetching/caching
- Debugging stale state or unnecessary re-renders
- Migrating from Redux or other state libraries

## State Categories Decision Tree

```
What kind of state?
├── UI State (local) → useState / useReducer
│   └── Shared across 2-3 components → Lift state up
├── UI State (global) → Zustand
│   └── Theme, sidebar open, modals, toasts
├── Server State → TanStack Query
│   └── API data, caching, background refetching
├── URL State → useSearchParams / nuqs
│   └── Filters, pagination, sort, tab selection
└── Form State → React Hook Form + Zod
    └── Inputs, validation, submission
```

## 1. Local State — useState / useReducer

**Use for:** Component-scoped UI state that doesn't need sharing.

```tsx
// Simple toggle
const [isOpen, setIsOpen] = useState(false);

// Complex state with multiple transitions — use useReducer
type Action =
  | { type: 'FETCH_START' }
  | { type: 'FETCH_SUCCESS'; data: Item[] }
  | { type: 'FETCH_ERROR'; error: string };

interface State {
  items: Item[];
  loading: boolean;
  error: string | null;
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'FETCH_START':
      return { ...state, loading: true, error: null };
    case 'FETCH_SUCCESS':
      return { items: action.data, loading: false, error: null };
    case 'FETCH_ERROR':
      return { ...state, loading: false, error: action.error };
  }
}
```

**Rule:** If you have 3+ related `useState` calls that change together, switch to `useReducer`.

## 2. Global UI State — Zustand

**Use for:** State shared across many components (theme, auth status, notifications, layout).

### Setup

```bash
pnpm add zustand
```

### Store Pattern

```tsx
// src/stores/use-app-store.ts
import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';

interface AppState {
  theme: 'light' | 'dark';
  sidebarOpen: boolean;
  setTheme: (theme: 'light' | 'dark') => void;
  toggleSidebar: () => void;
}

export const useAppStore = create<AppState>()(
  devtools(
    persist(
      (set) => ({
        theme: 'light',
        sidebarOpen: true,
        setTheme: (theme) => set({ theme }),
        toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
      }),
      { name: 'app-store' }
    )
  )
);
```

### Usage — Select Only What You Need

```tsx
// GOOD — component re-renders only when theme changes
const theme = useAppStore((s) => s.theme);

// BAD — re-renders on ANY store change
const { theme } = useAppStore();
```

### Zustand Rules
- One store per domain (app, auth, notifications) — not one mega store
- Always use selectors for reads
- Use `persist` middleware for state that survives refresh (theme, user preferences)
- Use `devtools` middleware in development
- Keep actions in the store, not in components
- Never store server data in Zustand — use TanStack Query

## 3. Server State — TanStack Query

**Use for:** All data from APIs. Handles caching, refetching, loading states, error states, optimistic updates.

### Setup

```bash
pnpm add @tanstack/react-query @tanstack/react-query-devtools
```

### Provider Setup

```tsx
// src/providers/query-provider.tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000,
      gcTime: 5 * 60 * 1000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

export function QueryProvider({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
}
```

### Query Pattern — Custom Hooks

```tsx
// src/hooks/use-users.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

const userKeys = {
  all: ['users'] as const,
  lists: () => [...userKeys.all, 'list'] as const,
  list: (filters: UserFilters) => [...userKeys.lists(), filters] as const,
  details: () => [...userKeys.all, 'detail'] as const,
  detail: (id: string) => [...userKeys.details(), id] as const,
};

export function useUsers(filters: UserFilters) {
  return useQuery({
    queryKey: userKeys.list(filters),
    queryFn: () => api.users.list(filters),
  });
}

export function useUser(id: string) {
  return useQuery({
    queryKey: userKeys.detail(id),
    queryFn: () => api.users.get(id),
    enabled: !!id,
  });
}

export function useUpdateUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: UpdateUserInput) => api.users.update(data),
    onMutate: async (newData) => {
      await queryClient.cancelQueries({ queryKey: userKeys.detail(newData.id) });
      const previous = queryClient.getQueryData(userKeys.detail(newData.id));
      queryClient.setQueryData(userKeys.detail(newData.id), (old: User) => ({
        ...old,
        ...newData,
      }));
      return { previous };
    },
    onError: (_err, newData, context) => {
      queryClient.setQueryData(userKeys.detail(newData.id), context?.previous);
    },
    onSettled: (_data, _err, variables) => {
      queryClient.invalidateQueries({ queryKey: userKeys.detail(variables.id) });
    },
  });
}
```

### TanStack Query Rules
- NEVER store API data in useState or Zustand
- Every API call gets its own custom hook
- Query keys are structured objects (not strings)
- Use `enabled` to conditionally fetch
- Use `staleTime` (not refetchInterval) for most cases
- Optimistic updates for mutations that need instant feedback
- Invalidate related queries after mutations

## 4. URL State — Search Params

**Use for:** Filters, pagination, sort order, active tabs — anything the user should be able to bookmark or share.

### Next.js (App Router)

```tsx
'use client';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';

export function useUrlState<T extends string>(key: string, defaultValue: T) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const value = (searchParams.get(key) as T) ?? defaultValue;

  const setValue = (newValue: T) => {
    const params = new URLSearchParams(searchParams.toString());
    if (newValue === defaultValue) {
      params.delete(key);
    } else {
      params.set(key, newValue);
    }
    router.replace(`${pathname}?${params.toString()}`);
  };

  return [value, setValue] as const;
}
```

### Vite (with nuqs)

```bash
pnpm add nuqs
```

```tsx
import { useQueryState, parseAsInteger } from 'nuqs';

function ProductList() {
  const [search, setSearch] = useQueryState('q', { defaultValue: '' });
  const [page, setPage] = useQueryState('page', parseAsInteger.withDefault(1));
  const [sort, setSort] = useQueryState('sort', { defaultValue: 'newest' });
}
```

## Anti-Patterns to Avoid

| Anti-Pattern | Instead |
|-------------|---------|
| Storing API data in useState | Use TanStack Query |
| Prop drilling through 4+ levels | Zustand store or composition |
| Context for frequently changing values | Zustand (Context causes full tree re-render) |
| One giant Redux/Zustand store | Split by domain |
| useEffect to sync state | Derive it or use useMemo |
| Fetching in useEffect | TanStack Query |
| Manual loading/error states | TanStack Query gives these for free |
| Duplicating server state in client | Single source: TanStack Query cache |

## Testing State

### Zustand — test the store directly

```tsx
import { useAppStore } from '@/stores/use-app-store';

beforeEach(() => {
  useAppStore.setState({ theme: 'light', sidebarOpen: true });
});

test('toggleSidebar flips the value', () => {
  useAppStore.getState().toggleSidebar();
  expect(useAppStore.getState().sidebarOpen).toBe(false);
});
```

### TanStack Query — use wrapper

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

test('useUsers returns user list', async () => {
  const { result } = renderHook(() => useUsers({}), { wrapper: createWrapper() });
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(result.current.data).toHaveLength(3);
});
```
