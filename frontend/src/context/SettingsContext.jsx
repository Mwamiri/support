import { createContext, useContext, useEffect, useState } from 'react'
import api from '../utils/api'

const SettingsContext = createContext({})

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState({})
  const [loaded,   setLoaded]   = useState(false)

  useEffect(() => {
    api.get('/settings')
      .then(r => {
        setSettings(r.data)
        applySettingsToDOM(r.data)
      })
      .catch(() => {})
      .finally(() => setLoaded(true))
  }, [])

  const refresh = () => {
    api.get('/settings').then(r => {
      setSettings(r.data)
      applySettingsToDOM(r.data)
    })
  }

  return (
    <SettingsContext.Provider value={{ settings, loaded, refresh }}>
      {children}
    </SettingsContext.Provider>
  )
}

export const useSettings = () => useContext(SettingsContext)

// Apply settings to DOM dynamically
function applySettingsToDOM(s) {
  if (!s) return

  // Page title
  if (s.site_name) document.title = s.site_name

  // Meta description
  let metaDesc = document.querySelector('meta[name="description"]')
  if (!metaDesc) { metaDesc = document.createElement('meta'); metaDesc.name='description'; document.head.appendChild(metaDesc) }
  if (s.site_description) metaDesc.content = s.site_description

  // Meta keywords
  let metaKw = document.querySelector('meta[name="keywords"]')
  if (!metaKw) { metaKw = document.createElement('meta'); metaKw.name='keywords'; document.head.appendChild(metaKw) }
  if (s.site_keywords) metaKw.content = s.site_keywords

  // OG tags
  const og = (prop, val) => {
    if (!val) return
    let el = document.querySelector(`meta[property="${prop}"]`)
    if (!el) { el = document.createElement('meta'); el.setAttribute('property', prop); document.head.appendChild(el) }
    el.content = val
  }
  og('og:title',       s.og_title || s.site_name)
  og('og:description', s.og_description || s.site_description)
  og('og:image',       s.og_image)
  og('og:url',         s.site_url)

  // Favicon
  if (s.favicon_url) {
    let link = document.querySelector("link[rel~='icon']")
    if (!link) { link = document.createElement('link'); link.rel='icon'; document.head.appendChild(link) }
    link.href = `${import.meta.env.VITE_API_URL || 'http://localhost:5000'}${s.favicon_url}`
  }

  // CSS variables for brand colors
  if (s.primary_color || s.accent_color || s.dark_color) {
    const root = document.documentElement
    if (s.primary_color) root.style.setProperty('--brand-primary', s.primary_color)
    if (s.accent_color)  root.style.setProperty('--brand-accent',  s.accent_color)
    if (s.dark_color)    root.style.setProperty('--brand-dark',     s.dark_color)
  }

  // Google Analytics
  if (s.google_analytics && !document.getElementById('ga-script')) {
    const script = document.createElement('script')
    script.id  = 'ga-script'
    script.src = `https://www.googletagmanager.com/gtag/js?id=${s.google_analytics}`
    script.async = true
    document.head.appendChild(script)
  }
}
