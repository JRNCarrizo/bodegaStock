import { X, ZoomIn } from 'lucide-react'
import { cn } from '@/lib/utils'

export function ImagePreviewModal({
  src,
  alt,
  title,
  onClose
}: {
  src: string | null
  alt: string
  title?: string
  onClose: () => void
}) {
  if (!src) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={title ?? alt}
    >
      <div className="absolute inset-0 bg-slate-900/80 backdrop-blur-sm" />
      <div
        className="relative max-h-[90vh] max-w-[90vw]"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute -right-2 -top-2 z-10 rounded-full bg-white p-2 text-slate-600 shadow-panel hover:bg-slate-50"
          aria-label="Cerrar"
        >
          <X className="h-5 w-5" />
        </button>
        {title && (
          <p className="mb-2 text-center text-sm font-medium text-white">{title}</p>
        )}
        <img
          src={src}
          alt={alt}
          className="max-h-[85vh] max-w-[85vw] rounded-lg object-contain shadow-panel"
        />
      </div>
    </div>
  )
}

export function ImagePreviewHint({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'pointer-events-none absolute inset-0 flex items-center justify-center rounded-lg bg-black/0 opacity-0 transition-opacity group-hover:bg-black/20 group-hover:opacity-100',
        className
      )}
    >
      <ZoomIn className="h-5 w-5 text-white drop-shadow" />
    </span>
  )
}
