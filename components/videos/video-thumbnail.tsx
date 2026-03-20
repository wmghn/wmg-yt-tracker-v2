import Image from "next/image";

type Props = {
  src?: string | null;
  alt: string;
};

export function VideoThumbnail({ src, alt }: Props) {
  if (!src) {
    return (
      <div className="w-20 h-[45px] bg-zinc-100 rounded flex items-center justify-center text-zinc-400 text-xs">
        No img
      </div>
    );
  }

  return (
    <div className="relative w-20 h-[45px] rounded overflow-hidden bg-zinc-100 flex-shrink-0">
      <Image
        src={src}
        alt={alt}
        fill
        className="object-cover"
        unoptimized
      />
    </div>
  );
}
