import type { SVGProps } from 'react'

/** Silueta de botella de vino/bodega (Lucide no trae una clara). */
export function BottleIcon({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
      {...props}
    >
      <path d="M9.5 2h5v2.5h-5z" />
      <path d="M10.5 4.5v4" />
      <path d="M13.5 4.5v4" />
      <path d="M10.5 8.5 8 12.5V20a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2v-7.5L13.5 8.5" />
      <path d="M8 12.5h8" />
    </svg>
  )
}
