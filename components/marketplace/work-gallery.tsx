'use client';

import Image from 'next/image';
import { useRef, useState } from 'react';
import { Dialog as DialogPrimitive } from '@base-ui/react/dialog';
import { ChevronLeftIcon, ChevronRightIcon, XIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DialogOverlay, DialogPortal, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

export interface WorkGalleryImage {
  id: string;
  url: string;
  width: number | null;
  height: number | null;
  altText: string | null;
}

interface Props {
  images: WorkGalleryImage[];
  /** Work title — the alt-text fallback when an image carries none. */
  title: string;
}

// The gallery frame takes the first photo's natural aspect ratio so the
// space is reserved before the image arrives (T16 no-CLS criterion).
// Clamped to [3:4, 4:3] so one extreme panorama or tall crop can't eat
// the viewport; the lightbox always shows the uncropped photo.
function frameRatio(img: WorkGalleryImage | undefined): number {
  if (!img?.width || !img?.height) return 1;
  return Math.min(4 / 3, Math.max(3 / 4, img.width / img.height));
}

// T16 image gallery: scroll-snap swipe carousel below `md`, main image
// with a thumbnail rail from `md` up, and a shared full-screen zoom
// lightbox. The two layouts are CSS-gated siblings — the first slide and
// the main image share an identical `sizes` string so Next emits one
// preload between them.
export function WorkGallery({ images, title }: Props) {
  const [active, setActive] = useState(0);
  const [lightboxAt, setLightboxAt] = useState<number | null>(null);
  const trackRef = useRef<HTMLDivElement>(null);

  if (images.length === 0) {
    return (
      <div className="bg-secondary text-muted-foreground flex aspect-square items-center justify-center rounded-lg text-sm">
        No image
      </div>
    );
  }

  const ratio = frameRatio(images[0]);
  const altOf = (img: WorkGalleryImage) => img.altText ?? title;
  const heroSizes = '(min-width: 1024px) 60vw, 100vw';

  function handleTrackScroll() {
    const track = trackRef.current;
    if (!track || track.clientWidth === 0) return;
    setActive(Math.min(images.length - 1, Math.round(track.scrollLeft / track.clientWidth)));
  }

  function stepLightbox(delta: number) {
    setLightboxAt((at) => (at === null ? at : (at + delta + images.length) % images.length));
  }

  return (
    <>
      {/* Swipe carousel — below md */}
      <div className="relative md:hidden">
        <div
          ref={trackRef}
          onScroll={handleTrackScroll}
          className="flex snap-x snap-mandatory overflow-x-auto rounded-lg [scrollbar-width:none] motion-safe:scroll-smooth [&::-webkit-scrollbar]:hidden"
        >
          {images.map((img, i) => (
            <button
              key={img.id}
              type="button"
              onClick={() => setLightboxAt(i)}
              aria-label={`View photo ${i + 1} of ${images.length} full screen`}
              className="bg-secondary relative w-full shrink-0 cursor-zoom-in snap-center overflow-hidden"
              style={{ aspectRatio: ratio }}
            >
              <Image
                src={img.url}
                alt={altOf(img)}
                fill
                sizes={heroSizes}
                className="object-cover"
                priority={i === 0}
              />
            </button>
          ))}
        </div>
        {images.length > 1 && (
          <p
            aria-live="polite"
            className="bg-background/90 text-foreground absolute right-3 bottom-3 rounded-4xl px-2.5 py-0.5 text-xs font-medium"
          >
            {active + 1} / {images.length}
          </p>
        )}
      </div>

      {/* Main image + thumbnail rail — md and up */}
      <div className="hidden space-y-3 md:block">
        <button
          type="button"
          onClick={() => setLightboxAt(active)}
          aria-label={`View photo ${active + 1} of ${images.length} full screen`}
          className="bg-secondary relative block w-full cursor-zoom-in overflow-hidden rounded-lg"
          style={{ aspectRatio: ratio }}
        >
          <Image
            key={images[active]!.id}
            src={images[active]!.url}
            alt={altOf(images[active]!)}
            fill
            sizes={heroSizes}
            className="object-cover"
            priority={active === 0}
          />
        </button>
        {images.length > 1 && (
          <div className="flex flex-wrap gap-2" role="group" aria-label="Photos of this work">
            {images.map((img, i) => (
              <button
                key={img.id}
                type="button"
                onClick={() => setActive(i)}
                aria-label={`Show photo ${i + 1} of ${images.length}`}
                aria-current={i === active}
                className={cn(
                  'bg-secondary relative size-20 overflow-hidden rounded transition-opacity',
                  i === active
                    ? 'ring-foreground ring-2 ring-offset-2'
                    : 'opacity-70 hover:opacity-100',
                )}
              >
                <Image src={img.url} alt={altOf(img)} fill sizes="80px" className="object-cover" />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Zoom lightbox — uncropped photo on a near-opaque navy field.
          Base UI supplies focus trap, scroll lock, and Esc; arrows are ours. */}
      <DialogPrimitive.Root
        open={lightboxAt !== null}
        onOpenChange={(open) => {
          if (!open) setLightboxAt(null);
        }}
      >
        <DialogPortal>
          <DialogOverlay className="bg-foreground/95" />
          <DialogPrimitive.Popup
            className="fixed inset-0 z-50 flex flex-col outline-none"
            onKeyDown={(e) => {
              if (e.key === 'ArrowLeft') stepLightbox(-1);
              if (e.key === 'ArrowRight') stepLightbox(1);
            }}
          >
            <DialogTitle className="sr-only">Photos of {title}</DialogTitle>
            {lightboxAt !== null && (
              <>
                <div className="flex items-center justify-between p-3">
                  {images.length > 1 ? (
                    <p aria-live="polite" className="text-background px-2 text-sm">
                      {lightboxAt + 1} / {images.length}
                    </p>
                  ) : (
                    <span />
                  )}
                  <DialogPrimitive.Close
                    render={
                      <Button
                        variant="ghost"
                        size="icon-lg"
                        className="text-background hover:bg-background/10 hover:text-background"
                      />
                    }
                  >
                    <XIcon />
                    <span className="sr-only">Close photo viewer</span>
                  </DialogPrimitive.Close>
                </div>
                <div className="relative min-h-0 flex-1">
                  <Image
                    key={images[lightboxAt]!.id}
                    src={images[lightboxAt]!.url}
                    alt={altOf(images[lightboxAt]!)}
                    fill
                    sizes="100vw"
                    className="object-contain"
                  />
                </div>
                <div className="flex min-h-14 items-center justify-center gap-4 p-3">
                  {images.length > 1 && (
                    <>
                      <Button
                        variant="ghost"
                        size="icon-lg"
                        className="text-background hover:bg-background/10 hover:text-background"
                        onClick={() => stepLightbox(-1)}
                      >
                        <ChevronLeftIcon />
                        <span className="sr-only">Previous photo</span>
                      </Button>
                      <p className="text-background/80 max-w-xl truncate text-sm">
                        {altOf(images[lightboxAt]!)}
                      </p>
                      <Button
                        variant="ghost"
                        size="icon-lg"
                        className="text-background hover:bg-background/10 hover:text-background"
                        onClick={() => stepLightbox(1)}
                      >
                        <ChevronRightIcon />
                        <span className="sr-only">Next photo</span>
                      </Button>
                    </>
                  )}
                </div>
              </>
            )}
          </DialogPrimitive.Popup>
        </DialogPortal>
      </DialogPrimitive.Root>
    </>
  );
}
