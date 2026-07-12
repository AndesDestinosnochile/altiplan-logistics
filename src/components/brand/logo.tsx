import transparentLogo from "@/assets/andes-destinos-logo-transparent.png.asset.json";
import solidLogo from "@/assets/andes-destinos-logo.png.asset.json";
import { cn } from "@/lib/utils";

interface Props {
  className?: string;
  alt?: string;
  /** `transparent` for dark backgrounds, `solid` for light backgrounds. */
  variant?: "transparent" | "solid";
}

export function Logo({ className, alt = "Andes Destinos", variant = "transparent" }: Props) {
  const asset = variant === "solid" ? solidLogo : transparentLogo;
  return <img src={asset.url} alt={alt} className={className} />;
}

interface BadgeProps {
  className?: string;
  size?: number;
  /** Ring style around the badge. */
  tone?: "light" | "dark";
}

/** Circular logo badge — the official mark inside a polished round frame. */
export function LogoBadge({ className, size = 56, tone = "light" }: BadgeProps) {
  return (
    <div
      className={cn(
        "relative shrink-0 overflow-hidden rounded-full ring-1 shadow-elev-2",
        tone === "dark"
          ? "bg-white/95 ring-white/20"
          : "bg-white ring-black/5",
        className,
      )}
      style={{ width: size, height: size }}
    >
      <img
        src={solidLogo.url}
        alt="Andes Destinos"
        className="absolute inset-0 h-full w-full scale-[1.35] object-cover"
        draggable={false}
      />

    </div>
  );
}
