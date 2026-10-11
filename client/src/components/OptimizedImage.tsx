import type { ImgHTMLAttributes } from "react";
import { imageSizes, imageSrcSet, optimizeImageUrl } from "@/lib/imageUrl";

type OptimizedImageProps = ImgHTMLAttributes<HTMLImageElement> & {
  widthHint?: number;
  sizes?: string;
  /**
   * Marks this image as an LCP candidate: eager loading + high fetch priority.
   * Lazily loading an above-the-fold LCP image defers its fetch until after the
   * bundle parses, which is the largest single hero LCP regression.
   */
  priority?: boolean;
};

export function OptimizedImage({
  src,
  widthHint,
  sizes = imageSizes.card,
  priority = false,
  loading,
  decoding = "async",
  fetchPriority,
  ...props
}: OptimizedImageProps) {
  const optimizedSrc = optimizeImageUrl(src, { width: widthHint });
  const responsiveSrcSet = imageSrcSet(src);

  return (
    <img
      {...props}
      src={optimizedSrc}
      srcSet={responsiveSrcSet}
      sizes={responsiveSrcSet ? sizes : undefined}
      loading={loading ?? (priority ? "eager" : "lazy")}
      decoding={decoding}
      fetchPriority={priority ? "high" : fetchPriority}
    />
  );
}
