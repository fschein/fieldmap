import * as React from "react"

export function FieldMapLogo(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      {/* Container */}
      <rect x="3" y="3" width="18" height="18" rx="3" strokeWidth="1.2" />

      {/* Grid horizontal */}
      <line x1="5" y1="9" x2="19" y2="9" strokeWidth="1.5" />
      <line x1="5" y1="15" x2="19" y2="15" strokeWidth="1.5" />

      {/* Grid vertical */}
      <line x1="10" y1="5" x2="10" y2="19" strokeWidth="1.5" />
      <line x1="16" y1="5" x2="16" y2="19" strokeWidth="1.5" />
    </svg>
  )
}

export function FieldMapLogoBrand(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#ffffff"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <rect x="2" y="2" width="20" height="20" rx="4" fill="#C65D3B" stroke="none" />
      <rect x="3" y="3" width="18" height="18" rx="3" strokeWidth="1.2" />
      <line x1="5" y1="9" x2="19" y2="9" strokeWidth="1.5" />
      <line x1="5" y1="15" x2="19" y2="15" strokeWidth="1.5" />
      <line x1="10" y1="5" x2="10" y2="19" strokeWidth="1.5" />
      <line x1="16" y1="5" x2="16" y2="19" strokeWidth="1.5" />
    </svg>
  )
}