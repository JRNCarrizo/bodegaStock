import { useEffect, useState } from 'react'
import { Package } from 'lucide-react'
import { getApiUrl, cn } from '@/lib/utils'
import { ImagePreviewHint } from '@/components/ImagePreviewModal'

export function ProductImage({
  productoId,
  hasImage,
  className,
  alt,
  clickable = false,
  onPreview
}: {
  productoId: number
  hasImage: boolean
  className?: string
  alt: string
  clickable?: boolean
  onPreview?: (src: string) => void
}) {
  const [src, setSrc] = useState<string | null>(null)

  useEffect(() => {
    if (!hasImage) {
      setSrc(null)
      return
    }

    let objectUrl: string | null = null
    const token = localStorage.getItem('token')

    fetch(`${getApiUrl()}/api/productos/${productoId}/imagen`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    })
      .then((res) => (res.ok ? res.blob() : null))
      .then((blob) => {
        if (blob) {
          objectUrl = URL.createObjectURL(blob)
          setSrc(objectUrl)
        }
      })
      .catch(() => setSrc(null))

    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [productoId, hasImage])

  if (!src) {
    return (
      <div
        className={cn(
          'flex items-center justify-center rounded-lg bg-slate-100 text-slate-400',
          className
        )}
      >
        <Package className="h-5 w-5" />
      </div>
    )
  }

  const image = (
    <img src={src} alt={alt} className={cn('rounded-lg object-cover', className)} />
  )

  if (clickable && onPreview) {
    return (
      <button
        type="button"
        onClick={() => onPreview(src)}
        className={cn('group relative shrink-0 cursor-zoom-in overflow-hidden rounded-lg', className)}
        title="Ver imagen ampliada"
      >
        {image}
        <ImagePreviewHint />
      </button>
    )
  }

  return image
}
