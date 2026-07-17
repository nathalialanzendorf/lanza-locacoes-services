type Props = {
  variant?: "sidebar" | "auth";
  className?: string;
};

/** Logo Lanza — `D:\Dropbox\Aluguel Carros\Lanza Locações Veiculares\Logos\logo_branca_semfundo.png` */
export function BrandMark({ variant = "sidebar", className }: Props) {
  const src =
    variant === "sidebar" ? "/logo_branca_semfundo.png" : "/logo-preta.png";
  return (
    <img
      src={src}
      alt="Lanza Locações Veiculares"
      className={className ?? "brand__mark-img"}
    />
  );
}
