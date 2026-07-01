"use client";

import Image from "next/image";
import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";

interface BrandLogoProps {
  size?: "sm" | "md" | "lg";
  showText?: boolean;
  className?: string;
}

const heights = { sm: 36, md: 52, lg: 72 };

export function BrandLogo({ size = "md", showText = false, className }: BrandLogoProps) {
  const h = heights[size];
  const [brand, setBrand] = useState<any | null>(null);

  useEffect(() => {
    fetch("/api/marca")
      .then((r) => r.json())
      .then((res) => {
        if (res.success) setBrand(res.data);
      })
      .catch(() => {});
  }, []);

  const src = brand?.logoPath ?? "/logo-garagem-do-ka.png";
  const displayName = brand?.displayName ?? "GARAGEM DO KA";

  return (
    <div className={cn("flex items-center gap-3", className)}>
      <Image
        src={src}
        alt={displayName}
        width={Math.round(h * 1.1)}
        height={h}
        className="object-contain drop-shadow-gold"
        priority
      />
      {showText && (
        <div className="hidden sm:block">
          <p className="font-serif text-sm font-bold tracking-widest text-brand-300">{displayName}</p>
          <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Estética Automotiva</p>
        </div>
      )}
    </div>
  );
}
