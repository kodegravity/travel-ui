import { useRef, useState } from 'react'
import { Coffee, Map, Route, Sparkles, Star } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { AppLayout } from '../components/layout/AppLayout'
import { DestinationSearch, type DestinationSelection, type TripRequest } from '../components/home/DestinationSearch'
import { BRAND_NAME } from '../config/brand'
import { FEATURED, findCity, POPULAR, POPULAR_COUNTRY } from '../data/destinations'

const BENEFITS = [
  {
    icon: Star,
    tone: 'blue',
    title: 'Curated Attractions',
    text: 'Landmarks, museums and hidden gems with visit durations and practical details.',
  },
  {
    icon: Route,
    tone: 'coral',
    title: 'Smart Routes',
    text: 'Get a suggested visiting order that balances travel time against time spent at each stop.',
  },
  {
    icon: Coffee,
    tone: 'green',
    title: 'Local Experiences',
    text: 'Cafés, markets, food spots and neighborhood favorites alongside the headline sights.',
  },
  {
    icon: Map,
    tone: 'slate',
    title: 'Interactive Maps',
    text: 'See every stop on a map, with walking directions one tap away.',
  },
] as const

/** City skyline silhouette along the bottom of the hero. */
const SKYLINE_PATH =
  'M0 220V150h60v-30h40v30h50V90h30V70h20v20h30v60h60v-40h50v40h40V60h12V40h8V30h8v10h8v20h12v90h70v-50h60v50h50V100h20c0-30 18-52 40-56V36h6v8c22 4 40 26 40 56h20v50h60v-70h40v70h70v-40h50V60h30v90h60v-30h50v30h60V80h20V60h20v20h20v70h70v-50h50v50h60v-80h40v80h40v-40h50v40h50v70z'

export function HomePage() {
  const navigate = useNavigate()
  const searchRef = useRef<HTMLDivElement>(null)
  const [selection, setSelection] = useState<DestinationSelection>({ country: null, cityId: null })

  /** Featured and popular cities prefill the search instead of jumping ahead. */
  function prefill(cityId: string) {
    const city = findCity(cityId)
    if (!city) return
    setSelection({ country: city.country, cityId: city.id })
    searchRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'center' })
  }

  function explore(trip: TripRequest) {
    const params = new URLSearchParams({
      city: trip.cityId,
      arrive: trip.arrive,
      depart: trip.depart,
      travelers: String(trip.travelers),
    })
    navigate(`/explore?${params.toString()}`)
  }

  return (
    <AppLayout active="home">
      <div className="home">
        <section className="home-hero" aria-labelledby="home-title">
          <svg className="home-hero__skyline" viewBox="0 0 1440 220" preserveAspectRatio="none" aria-hidden="true">
            <path d={SKYLINE_PATH} />
          </svg>
          <div className="home-container home-hero__content">
            <span className="home-hero__badge">
              <Sparkles size={16} aria-hidden="true" />
              AI-assisted travel planning
            </span>
            <h1 id="home-title" className="home-hero__title">
              Discover Amazing Places. Plan Smarter.
            </h1>
            <p className="home-hero__lead">
              Explore the world&apos;s best destinations, discover local experiences, and find what fits your
              time and budget.
            </p>
          </div>
        </section>

        <div className="home-container home-search" ref={searchRef}>
          <DestinationSearch selection={selection} onSelectionChange={setSelection} onSubmit={explore} />
        </div>

        <section className="home-section" aria-labelledby="featured-title">
          <div className="home-container">
            <div className="home-section__head">
              <div>
                <p className="home-kicker">Featured</p>
                <h2 id="featured-title" className="home-section__title home-section__title--lg">
                  Destinations travelers love
                </h2>
              </div>
              <p className="home-section__aside">Pick one to prefill your search</p>
            </div>
            <ul className="featured-grid">
              {FEATURED.map((featured) => {
                const city = findCity(featured.cityId)
                if (!city) return null
                return (
                  <li key={city.id}>
                    <button
                      type="button"
                      className="tm-card destination-card"
                      onClick={() => prefill(city.id)}
                      aria-label={`${city.name}, ${city.country}. ${featured.blurb} Prefill search.`}
                    >
                      <span className="destination-card__photo tone-tile" style={{ backgroundColor: featured.tone }}>
                        <span className="destination-card__country">{city.country}</span>
                        <span className="destination-card__initial" aria-hidden="true">
                          {city.name.charAt(0)}
                        </span>
                      </span>
                      <span className="destination-card__body">
                        <span className="destination-card__name">{city.name}</span>
                        <span className="destination-card__blurb">{featured.blurb}</span>
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        </section>

        <section className="home-section home-section--tight" aria-labelledby="popular-title">
          <div className="home-container">
            <h2 id="popular-title" className="home-section__title">
              Popular cities in {POPULAR_COUNTRY}
            </h2>
            <ul className="city-pills">
              {POPULAR.map((popular) => {
                const city = findCity(popular.cityId)
                if (!city) return null
                return (
                  <li key={city.id}>
                    <button type="button" className="city-pill" onClick={() => prefill(city.id)}>
                      <span className="city-pill__dot tone-tile" style={{ backgroundColor: popular.tone }} aria-hidden="true" />
                      {city.name}
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        </section>

        <section className="home-section" aria-labelledby="benefits-title">
          <div className="home-container">
            <h2 id="benefits-title" className="home-section__title">
              Plan the whole trip in one place
            </h2>
            <ul className="benefit-grid">
              {BENEFITS.map(({ icon: Icon, tone, title, text }) => (
                <li key={title} className="tm-card benefit-card">
                  <span className={`benefit-card__icon benefit-card__icon--${tone}`} aria-hidden="true">
                    <Icon size={24} strokeWidth={2} />
                  </span>
                  <h3 className="benefit-card__title">{title}</h3>
                  <p className="benefit-card__text">{text}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <footer className="home-footer">
          <div className="home-container home-footer__inner">
            <span className="home-footer__brand">{BRAND_NAME}</span>
            <span>Visit times and costs are estimates. Check opening hours and prices before you go.</span>
          </div>
        </footer>
      </div>
    </AppLayout>
  )
}
