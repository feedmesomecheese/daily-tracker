"use client";

export function LoadingScreen({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
      {children}
    </div>
  );
}
