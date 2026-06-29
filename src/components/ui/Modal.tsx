"use client";

import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  size?: "sm" | "md" | "lg";
}

export function Modal({ open, onClose, title, children, size = "md" }: ModalProps) {
  if (!open) return null;

  const sizes = {
    sm: "max-w-md",
    md: "max-w-lg",
    lg: "max-w-2xl",
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div
        className={cn(
          "relative w-full rounded-xl border border-brand-800/30 bg-surface-800 shadow-gold-lg",
          sizes[size]
        )}
      >
        <div className="flex items-center justify-between border-b border-brand-900/40 px-6 py-4">
          <h2 className="font-serif text-lg font-semibold text-brand-200">{title}</h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 transition hover:bg-surface-700 hover:text-brand-300"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="max-h-[80vh] overflow-y-auto p-6">{children}</div>
      </div>
    </div>
  );
}
