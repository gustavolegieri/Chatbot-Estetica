import Image from "next/image";
import { cn } from "@/lib/utils";

interface BrandLogoProps {
  size?: "sm" | "md" | "lg";
  showText?: boolean;
  className?: string;
}

const heights = { sm: 36, md: 52, lg: 72 };

export function BrandLogo({ size = "md", showText = false, className }: BrandLogoProps) {
  const h = heights[size];

  return (
    <div className={cn("flex items-center gap-3", className)}>
      <Image
        src="/logo-garagem-do-ka.png"
        alt="Garagem do Ka — Estética Automotiva"
        width={Math.round(h * 1.1)}
        height={h}
        className="object-contain drop-shadow-gold"
        priority
      />
      {showText && (
        <div className="hidden sm:block">
          <p className="font-serif text-sm font-bold tracking-widest text-brand-300">GARAGEM DO KA</p>
          <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Estética Automotiva</p>
        </div>
      )}
    </div>
  );
}
