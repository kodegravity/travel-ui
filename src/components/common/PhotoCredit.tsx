import type { PlacePhoto } from '../../types/api'

/** Google requires a photo's author credits to be shown with it. {@code plain} drops the links, for use inside a link. */
export function PhotoCredit({ photo, className = '', plain = false }: { photo: PlacePhoto; className?: string; plain?: boolean }) {
  const authors = photo.attributions.filter((a) => a.displayName)
  if (authors.length === 0) return null
  return (
    <span className={`photo-credit ${className}`}>
      Photo:{' '}
      {authors.map((author, i) => (
        <span key={`${author.displayName}-${i}`}>
          {i > 0 && ', '}
          {!plain && author.uri?.startsWith('https://') ? (
            <a href={author.uri} target="_blank" rel="noopener noreferrer">
              {author.displayName}
            </a>
          ) : (
            author.displayName
          )}
        </span>
      ))}
    </span>
  )
}
