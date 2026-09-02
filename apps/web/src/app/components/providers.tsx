"use client";
// This directive marks everything in this file as Client Components.
// Next.js's App Router renders components on the SERVER by default.
// But we need `useState`, `useEffect`, and Zustand (which reads
// localStorage, a browser-only API) — none of that can run on the
// server, so this file has to opt out of server rendering.

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useAuthStore } from '@/lib/store/auth-store';
import { ToastViewport } from './Toast';

// This component wraps your entire app (see layout.tsx, where it wraps
// {children}). Anything that needs to be set up ONCE, and be available
// to every page, goes here — a bit like a control room for the app.
export function Providers({ children }: { children: React.ReactNode }) {
  // We create ONE QueryClient (React Query's cache/manager for all your
  // API data) and keep it stable across re-renders using useState's
  // lazy initializer form: useState(() => new QueryClient()).
  // Passing a function instead of `new QueryClient()` directly means
  // it only ever runs once, on first render — not on every re-render.
  const [queryClient] = useState(() => new QueryClient());

  // Pull just the `hydrate` function out of the auth store. Using a
  // selector like `(state) => state.hydrate` instead of the whole
  // store means this component only re-renders if `hydrate` itself
  // changes (which it never does) — not every time ANY auth state
  // changes elsewhere in the app.
  const hydrate = useAuthStore((state) => state.hydrate);

  // useEffect with an empty-ish dependency array ([hydrate], but
  // hydrate never changes) means: "run this once, right after the
  // component first mounts in the browser." This is exactly where we
  // want to check localStorage for a saved login session — it only
  // runs client-side, never during server rendering.
  useEffect(() => {
    hydrate();
  }, [hydrate]);

  // QueryClientProvider makes `queryClient` available to every
  // component below it in the tree via React Context, so any component
  // can call React Query hooks (useQuery, useMutation) without prop
  // drilling the client down manually.
  // ToastViewport is react-hot-toast's renderer, mounted once so any
  // page or modal can call useToast() (see components/Toast.tsx). It's a
  // sibling rather than a wrapper because react-hot-toast keeps its own
  // store outside React context — nothing needs to be nested inside it.
  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <ToastViewport />
    </QueryClientProvider>
  );
}
