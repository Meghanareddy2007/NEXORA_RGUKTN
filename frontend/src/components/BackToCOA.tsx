"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

export default function BackToCOA({ className = "" }: { className?: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => router.push("/coa")}
      className={`inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground transition hover:bg-muted hover:text-foreground ${className}`}
    >
      <ArrowLeft className="h-3.5 w-3.5" />
      Back to COA
    </button>
  );
}
