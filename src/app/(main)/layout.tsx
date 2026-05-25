//src/app/(main)/layout.tsx

"use client";
import { ErrDialog } from "@/components/ErrorDialog";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ErrContext } from "./ErrContext";
const queryClient = new QueryClient();

// // Client-side (not Worker)
// import FingerprintJS from '@fingerprintjs/fingerprintjs';
// const fp = await FingerprintJS.load();
// const result = await fp.get();
// const fingerprint = result.visitorId; // e.g., 'a1b2c3d4'
// // Send fingerprint to Worker for logging

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative flex h-full w-full">
      <QueryClientProvider client={queryClient}>
        <ErrContext>
          <ErrDialog />
          {children}
        </ErrContext>
      </QueryClientProvider>
    </div>
  );
}
