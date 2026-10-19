import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SuggestionAlert } from './SuggestionAlert'

const suggestion = {
  placeId: 'place-a',
  name: 'Colosseum Walk',
  category: 'HISTORY',
  description: 'A guided walk past ancient ruins.',
  latitude: 41.8902,
  longitude: 12.4922,
}

describe('SuggestionAlert', () => {
  it('renders nothing without a suggestion', () => {
    const { container } = render(<SuggestionAlert suggestion={null} onDismiss={vi.fn()} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('announces the suggestion politely in a status region', () => {
    render(<SuggestionAlert suggestion={suggestion} onDismiss={vi.fn()} />)
    const alert = screen.getByRole('status')
    expect(alert).toHaveAttribute('aria-live', 'polite')
    expect(alert).toHaveTextContent('New nearby suggestion')
    expect(alert).toHaveTextContent('Colosseum Walk')
  })

  it('calls onDismiss when the traveler dismisses it', async () => {
    const onDismiss = vi.fn()
    render(<SuggestionAlert suggestion={suggestion} onDismiss={onDismiss} />)
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss suggestion' }))
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })
})
