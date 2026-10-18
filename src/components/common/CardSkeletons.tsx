/** Placeholder cards shown while results load, so the layout does not jump when they arrive. */
export function CardSkeletons({ count = 3 }: { count?: number }) {
  return (
    <ul className="recommendation-list" aria-hidden="true">
      {Array.from({ length: count }, (_, index) => (
        <li key={index}>
          <div className="recommendation-card skeleton-card">
            <span className="skeleton skeleton--badge" />
            <span className="skeleton skeleton--line skeleton--short" />
            <span className="skeleton skeleton--line skeleton--title" />
            <span className="skeleton skeleton--line" />
            <span className="skeleton skeleton--line skeleton--medium" />
          </div>
        </li>
      ))}
    </ul>
  )
}
