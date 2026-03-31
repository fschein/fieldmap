"use client"

import React, { createContext, useContext, useEffect, useState } from "react"

type FontScale = 1 | 1.1 | 1.2
type Theme = "light" | "dark"

interface SettingsContextType {
  fontScale: FontScale
  setFontScale: (scale: FontScale) => void
  theme: Theme
  setTheme: (theme: Theme) => void
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined)

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [fontScale, setFontScaleState] = useState<FontScale>(1)
  const [theme, setThemeState] = useState<Theme>("light")

  useEffect(() => {
    // Carrega Escala
    const savedScale = localStorage.getItem("fieldmap_font_scale")
    if (savedScale) {
      const scale = parseFloat(savedScale) as FontScale
      if ([1, 1.1, 1.2].includes(scale)) {
        setFontScaleState(scale)
        document.documentElement.style.setProperty("--font-scale", scale.toString())
      }
    }

    // Carrega Tema
    const savedTheme = localStorage.getItem("fieldmap_theme") as Theme
    if (savedTheme && ["light", "dark"].includes(savedTheme)) {
      setThemeState(savedTheme)
      if (savedTheme === "dark") {
        document.documentElement.classList.add("dark")
      }
    } else if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
      // Opcional: auto detect dark mode if not set
      // setThemeState("dark")
      // document.documentElement.classList.add("dark")
    }
  }, [])

  const setFontScale = (scale: FontScale) => {
    setFontScaleState(scale)
    localStorage.setItem("fieldmap_font_scale", scale.toString())
    document.documentElement.style.setProperty("--font-scale", scale.toString())
  }

  const setTheme = (newTheme: Theme) => {
    setThemeState(newTheme)
    localStorage.setItem("fieldmap_theme", newTheme)
    if (newTheme === "dark") {
      document.documentElement.classList.add("dark")
    } else {
      document.documentElement.classList.remove("dark")
    }
  }

  return (
    <SettingsContext.Provider value={{ fontScale, setFontScale, theme, setTheme }}>
      {children}
    </SettingsContext.Provider>
  )
}

export function useSettings() {
  const context = useContext(SettingsContext)
  if (context === undefined) {
    throw new Error("useSettings must be used within a SettingsProvider")
  }
  return context
}
