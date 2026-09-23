import { getSignedUrl } from '../lib/supabase'
import { useQuery } from '../lib/useQuery'

/** Displays an image from one of the private drawing-layer buckets. */
export default function SignedImage({ layer, path, alt = '', className = '', link = false }) {
  const { data: url, error } = useQuery(`signed:${layer}:${path}`, () => getSignedUrl(layer, path))

  if (error) {
    return (
      <div className={`flex items-center justify-center bg-slate-100 text-xs text-slate-500 ${className}`}>
        Image unavailable
      </div>
    )
  }
  if (!url) return <div className={`animate-pulse bg-slate-200 ${className}`} />

  const img = <img src={url} alt={alt} loading="lazy" className={className} />
  return link ? (
    <a href={url} target="_blank" rel="noreferrer">
      {img}
    </a>
  ) : (
    img
  )
}
