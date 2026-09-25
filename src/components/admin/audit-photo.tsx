"use client";

import Image from "next/image";
import { ImageOff } from "lucide-react";
import { useState } from "react";

export function AuditPhoto({ src, alt }: { src: string; alt: string }) {
  const [failed, setFailed] = useState(false);
  return failed ? (
    <span className="admin-audit-photo-unavailable" role="img" aria-label={`${alt}: imagen no disponible`}>
      <ImageOff size={22} aria-hidden="true" />
      <span>Foto no disponible</span>
    </span>
  ) : <Image src={src} alt={alt} width={240} height={300} unoptimized onError={() => setFailed(true)} />;
}
