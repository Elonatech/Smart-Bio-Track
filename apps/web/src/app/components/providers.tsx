"use client";
// This directive marks everything in this file as Client Components.
// Next.js's App Router renders components on the SERVER by default.
// But we need `useState`, `useEffect`, and Zustand (which reads
// localStorage, a browser-only API) — none of that can run on the
// server, so this file has to opt out of server rendering.

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { restoreSession } from '@/lib/session';
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

  // Runs once, right after this mounts in the browser: ask the server whether
  // the httpOnly refresh cookie still represents a session, and rebuild the
  // store from the answer. See lib/session.ts.
  //
  // It has to be an effect rather than part of render because it is a network
  // call and it must never run during server rendering — the cookie belongs to
  // the browser's request, not to Next's render pass.
  //
  // `restoreSession` never rejects (it handles its own failure as "signed
  // out"), so there is nothing to catch here.
  useEffect(() => {
    void restoreSession();
  }, []);

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
