"use client"

import { useEffect } from "react"

export function NoSelect() {
  useEffect(() => {
    const onSelectStart = (e: Event) => {
      const el = e.target as HTMLElement
      if (
        el.tagName === "INPUT" ||
        el.tagName === "TEXTAREA" ||
        el.isContentEditable
      ) return
      e.preventDefault()
    }

    const onTouchEnd = () => {
      window.getSelection()?.removeAllRanges()
    }

    document.addEventListener("selectstart", onSelectStart)
    document.addEventListener("touchend", onTouchEnd)
    return () => {
      document.removeEventListener("selectstart", onSelectStart)
      document.removeEventListener("touchend", onTouchEnd)
    }
  }, [])

  return null
}
