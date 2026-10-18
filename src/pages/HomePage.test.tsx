import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { HomePage } from './HomePage'

function ExploreProbe() {
  const location = useLocation()
  return <p data-testid="explore-url">{`${location.pathname}${location.search}`}</p>
}

function renderHome() {
  render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/explore/:cityId" element={<ExploreProbe />} />
      </Routes>
    </MemoryRouter>,
  )
  return userEvent.setup()
}

function exploreButton() {
  return screen.getByRole('button', { name: 'Explore Destination' })
}

async function pickCountryAndCity(user: ReturnType<typeof userEvent.setup>, country: string, city: string) {
  await user.click(screen.getByRole('combobox', { name: 'Country' }))
  await user.click(screen.getByRole('option', { name: new RegExp(`^${country}`) }))
  await user.click(screen.getByRole('combobox', { name: 'City' }))
  await user.click(screen.getByRole('option', { name: new RegExp(`^${city}`) }))
}

describe('HomePage', () => {
  it('shows the hero, the search card, and the home sections', () => {
    renderHome()

    expect(screen.getByRole('heading', { level: 1, name: 'Discover Amazing Places. Plan Smarter.' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Where are you headed?' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Destinations travelers love' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Popular cities in Spain' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Plan the whole trip in one place' })).toBeInTheDocument()
  })

  it('keeps the city picker disabled until a country is chosen', async () => {
    const user = renderHome()
    const city = screen.getByRole('combobox', { name: 'City' })

    expect(city).toBeDisabled()
    expect(city).toHaveAttribute('placeholder', 'Select a country first')

    await user.click(screen.getByRole('combobox', { name: 'Country' }))
    await user.click(screen.getByRole('option', { name: /^Italy/ }))

    expect(city).toBeEnabled()
    expect(city).toHaveAttribute('placeholder', 'Search cities in Italy')
  })

  it('filters options as the traveler types and picks with the keyboard', async () => {
    const user = renderHome()
    const country = screen.getByRole('combobox', { name: 'Country' })

    await user.click(country)
    await user.keyboard('jap')
    const list = screen.getByRole('listbox', { name: 'Country' })
    expect(within(list).getAllByRole('option')).toHaveLength(1)

    await user.keyboard('{Enter}')
    expect(country).toHaveValue('Japan')
    expect(screen.queryByRole('listbox', { name: 'Country' })).not.toBeInTheDocument()

    await user.click(country)
    await user.keyboard('zzz')
    expect(screen.getByText('No matching countries')).toBeInTheDocument()
  })

  it('shows field errors when submitted empty and does not navigate', async () => {
    const user = renderHome()

    await user.click(exploreButton())

    expect(screen.getByText('Choose a country')).toBeInTheDocument()
    expect(screen.getByText('Choose a city')).toBeInTheDocument()
    expect(screen.queryByTestId('explore-url')).not.toBeInTheDocument()
  })

  it('flags a departure before arrival', async () => {
    const user = renderHome()
    const [arrive, depart] = screen.getAllByDisplayValue(/\d{4}-\d{2}-\d{2}/)

    await user.clear(arrive!)
    await user.type(arrive!, '2030-05-10')
    await user.clear(depart!)
    await user.type(depart!, '2030-05-08')

    expect(screen.getByText('Departure must be on or after arrival')).toBeInTheDocument()
  })

  it('keeps travelers between 1 and 16', async () => {
    const user = renderHome()
    const remove = screen.getByRole('button', { name: 'Remove traveler' })
    const add = screen.getByRole('button', { name: 'Add traveler' })
    const group = screen.getByRole('group', { name: 'Travelers' })

    await user.click(remove)
    expect(group).toHaveTextContent('1')
    expect(remove).toBeDisabled()

    for (let i = 0; i < 20; i += 1) {
      if (!add.hasAttribute('disabled')) await user.click(add)
    }
    expect(group).toHaveTextContent('16')
    expect(add).toBeDisabled()
  })

  it('opens the explorer for the chosen city with the trip details', async () => {
    const user = renderHome()
    await pickCountryAndCity(user, 'Spain', 'Seville')
    await user.click(screen.getByRole('button', { name: 'Add traveler' }))

    await user.click(exploreButton())

    const url = new URL(screen.getByTestId('explore-url').textContent!, 'http://app')
    expect(url.pathname).toBe('/explore/seville')
    expect(url.searchParams.get('travelers')).toBe('3')
    expect(url.searchParams.get('arrive')).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('prefills the search from a featured destination', async () => {
    const user = renderHome()

    await user.click(screen.getByRole('button', { name: /^Kyoto, Japan/ }))

    expect(screen.getByRole('combobox', { name: 'Country' })).toHaveValue('Japan')
    expect(screen.getByRole('combobox', { name: 'City' })).toHaveValue('Kyoto')
  })

  it('prefills the search from a popular city', async () => {
    const user = renderHome()

    await user.click(screen.getByRole('button', { name: 'Málaga' }))
    await user.click(exploreButton())

    expect(screen.getByTestId('explore-url').textContent).toMatch(/^\/explore\/malaga\?/)
  })
})
