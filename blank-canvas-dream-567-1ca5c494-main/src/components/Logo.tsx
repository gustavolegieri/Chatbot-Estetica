import logoImage from '@/assets/logo.jpeg';

interface LogoProps {
  className?: string;
  showText?: boolean;
}

export function Logo({ className = "h-12 w-12", showText = true }: LogoProps) {
  return (
    <div className="flex items-center gap-3">
      <img 
        src={logoImage} 
        alt="EST ELITE Logo" 
        className={`${className} object-contain rounded-full`}
      />
      {showText && (
        <div className="flex flex-col">
          <span className="text-gradient-gold font-serif text-xl font-semibold tracking-widest">
            EST ELITE
          </span>
          <span className="text-muted-foreground text-[10px] tracking-[0.3em] uppercase">
            Moda Feminina
          </span>
        </div>
      )}
    </div>
  );
}
