import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TravelExplorerPage } from './TravelExplorerPage'

function renderPage() {
  render(<TravelExplorerPage />)
  return userEvent.setup()
}

function budgetInput() {
  return screen.getByLabelText('Maximum budget')
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('TravelExplorerPage', () => {
  it('renders the brand, the heading, and the map region', () => {
    renderPage()

    expect(screen.getByText('ROAM / AI')).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { level: 1, name: 'Discover the moment. Not just the destination.' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Map of results' })).toBeInTheDocument()
  })

  it('renders every interest option unselected by default', () => {
    renderPage()

    for (const label of ['History', 'Food', 'Art', 'Nature', 'Shopping', 'Local experiences']) {
      expect(screen.getByRole('checkbox', { name: label })).not.toBeChecked()
    }
  })

  it('selects an interest when clicked', async () => {
    const user = renderPage()

    await user.click(screen.getByRole('checkbox', { name: 'Food' }))

    expect(screen.getByRole('checkbox', { name: 'Food' })).toBeChecked()
  })

  it('allows multiple interests to be selected and deselected', async () => {
    const user = renderPage()

    await user.click(screen.getByRole('checkbox', { name: 'History' }))
    await user.click(screen.getByRole('checkbox', { name: 'Nature' }))
    await user.click(screen.getByRole('checkbox', { name: 'Local experiences' }))

    expect(screen.getByRole('checkbox', { name: 'History' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Nature' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Local experiences' })).toBeChecked()

    await user.click(screen.getByRole('checkbox', { name: 'Nature' }))

    expect(screen.getByRole('checkbox', { name: 'Nature' })).not.toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'History' })).toBeChecked()
  })

  it('rejects a negative budget with an inline message', async () => {
    const user = renderPage()

    await user.type(budgetInput(), '-5')

    expect(budgetInput()).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByText('Budget cannot be negative.')).toBeInTheDocument()
  })

  it('clears the budget error once a valid amount is entered', async () => {
    const user = renderPage()

    await user.type(budgetInput(), '-5')
    await user.clear(budgetInput())
    await user.type(budgetInput(), '30')

    expect(screen.queryByText('Budget cannot be negative.')).not.toBeInTheDocument()
    expect(budgetInput()).not.toHaveAttribute('aria-invalid')
  })

  it('shows a required-budget error on submit when budget is empty', async () => {
    const user = renderPage()

    await user.click(screen.getByRole('checkbox', { name: 'Art' }))
    await user.click(screen.getByRole('button', { name: 'Save preferences' }))

    expect(screen.getByText('Enter a maximum budget.')).toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('requires at least one interest on submit', async () => {
    const user = renderPage()

    await user.type(budgetInput(), '20')
    await user.click(screen.getByRole('button', { name: 'Save preferences' }))

    expect(screen.getByText('Select at least one interest.')).toBeInTheDocument()
  })

  it('confirms when the form is valid', async () => {
    const user = renderPage()

    await user.click(screen.getByRole('checkbox', { name: 'Art' }))
    await user.type(budgetInput(), '20')
    await user.click(screen.getByRole('button', { name: 'Save preferences' }))

    expect(screen.getByRole('status')).toHaveTextContent(
      "Preferences look good. Press Start Exploring when you're ready.",
    )
  })

  it('offers 30, 60, 90, 120, and 180 minute presets with 60 selected by default', () => {
    renderPage()

    for (const minutes of [30, 60, 90, 120, 180]) {
      expect(screen.getByRole('radio', { name: `${minutes} min` })).toBeInTheDocument()
    }
    expect(screen.getByRole('radio', { name: '60 min' })).toBeChecked()
    expect(screen.queryByLabelText('Custom time (minutes)')).not.toBeInTheDocument()
  })

  it('reveals a custom time input when Custom is selected', async () => {
    const user = renderPage()

    await user.click(screen.getByRole('radio', { name: 'Custom' }))

    expect(screen.getByLabelText('Custom time (minutes)')).toBeInTheDocument()
  })

  it.each([
    ['5', 'Enter a whole number of minutes from 15 to 720.'],
    ['800', 'Enter a whole number of minutes from 15 to 720.'],
    ['12.5', 'Enter a whole number of minutes from 15 to 720.'],
  ])('rejects custom time "%s" with an inline message', async (value, message) => {
    const user = renderPage()

    await user.click(screen.getByRole('radio', { name: 'Custom' }))
    await user.type(screen.getByLabelText('Custom time (minutes)'), value)

    expect(screen.getByText(message)).toBeInTheDocument()
    expect(screen.getByLabelText('Custom time (minutes)')).toHaveAttribute('aria-invalid', 'true')
  })

  it('accepts a custom time within 15 to 720 minutes', async () => {
    const user = renderPage()

    await user.click(screen.getByRole('radio', { name: 'Custom' }))
    await user.type(screen.getByLabelText('Custom time (minutes)'), '45')

    expect(screen.queryByText(/Enter a whole number of minutes/)).not.toBeInTheDocument()
  })

  it('blocks submit with an invalid custom time', async () => {
    const user = renderPage()

    await user.click(screen.getByRole('checkbox', { name: 'Food' }))
    await user.type(budgetInput(), '20')
    await user.click(screen.getByRole('radio', { name: 'Custom' }))
    await user.type(screen.getByLabelText('Custom time (minutes)'), '5')
    await user.click(screen.getByRole('button', { name: 'Save preferences' }))

    expect(screen.getByText('Enter a whole number of minutes from 15 to 720.')).toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('offers EUR, USD, CAD, GBP, and JPY currencies and updates the selection', async () => {
    const user = renderPage()
    const currency = screen.getByLabelText('Currency')

    expect(within(currency).getAllByRole('option').map((o) => o.textContent)).toEqual([
      'EUR',
      'USD',
      'CAD',
      'GBP',
      'JPY',
    ])
    expect(currency).toHaveValue('EUR')

    await user.selectOptions(currency, 'GBP')

    expect(currency).toHaveValue('GBP')
  })

  it('shows Travel Mode as inactive with no location shared', () => {
    renderPage()

    expect(screen.getByText('Not Exploring')).toBeInTheDocument()
    expect(screen.getByText('Not Shared')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Start Exploring' })).toBeEnabled()
    expect(screen.queryByRole('button', { name: 'Stop Exploring' })).not.toBeInTheDocument()
  })

  it('opens on the search tab and shows the Travel Mode empty state on its tab', async () => {
    const user = renderPage()

    expect(screen.getByRole('tab', { name: 'Search results' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText('Search any place.')).toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: 'Travel Mode' }))

    expect(screen.getByRole('heading', { name: 'Travel Mode results' })).toBeInTheDocument()
    expect(screen.getByText('Your next adventure starts here.')).toBeInTheDocument()
    expect(
      screen.getByText('Choose your interests and start exploring to discover nearby experiences.'),
    ).toBeInTheDocument()
  })

  it('makes no network requests while interacting with the form', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const user = renderPage()

    await user.click(screen.getByRole('checkbox', { name: 'Art' }))
    await user.type(budgetInput(), '20')
    await user.click(screen.getByRole('button', { name: 'Save preferences' }))

    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
