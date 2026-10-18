import { Check } from 'lucide-react'

const STEPS = ['Choose places', 'Organize', 'Optimize route', 'Itinerary'] as const

/** Choose places → Organize → Optimize route → Itinerary, with the current step marked. */
export function TripSteps({ current }: { current: number }) {
  return (
    <ol className="trip-steps" aria-label="Trip steps">
      {STEPS.map((step, i) => (
        <li
          key={step}
          className={`trip-steps__step${i < current ? ' trip-steps__step--done' : ''}${i === current ? ' trip-steps__step--current' : ''}`}
          aria-current={i === current ? 'step' : undefined}
        >
          <span className="trip-steps__dot" aria-hidden="true">
            {i < current ? <Check size={14} strokeWidth={3} /> : i + 1}
          </span>
          {step}
        </li>
      ))}
    </ol>
  )
}
