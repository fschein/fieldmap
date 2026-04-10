"use client"

import { useSettings } from "@/providers/settings-provider"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Button } from "@/components/ui/button"
import { Eye, Check, Sun, Moon } from "lucide-react"

export function A11yControls() {
  const { fontScale, setFontScale, theme, setTheme } = useSettings()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="h-9 w-9 p-0" title="Acessibilidade">
          <Eye className="h-5 w-5" />
          <span className="sr-only">Acessibilidade</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56 z-[200]">
        <DropdownMenuLabel className="flex items-center gap-2">
          <Eye className="h-4 w-4" />
          Acessibilidade & Tema
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        
        <DropdownMenuLabel className="text-[0.625rem] uppercase tracking-wider text-muted-foreground pt-2">Tamanho do Texto</DropdownMenuLabel>
        <DropdownMenuItem onClick={() => setFontScale(1)} className="flex items-center justify-between">
          <span>Padrão</span>
          {fontScale === 1 && <Check className="h-4 w-4" />}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setFontScale(1.1)} className="flex items-center justify-between">
          <span>Médio</span>
          {fontScale === 1.1 && <Check className="h-4 w-4" />}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setFontScale(1.2)} className="flex items-center justify-between">
          <span>Grande</span>
          {fontScale === 1.2 && <Check className="h-4 w-4" />}
        </DropdownMenuItem>

        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-[0.625rem] uppercase tracking-wider text-muted-foreground pt-1">Aparência</DropdownMenuLabel>
        <DropdownMenuItem onClick={() => setTheme("light")} className="flex items-center justify-between">
          <span className="flex items-center gap-2"><Sun className="h-4 w-4" /> Claro</span>
          {theme === "light" && <Check className="h-4 w-4" />}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("dark")} className="flex items-center justify-between">
          <span className="flex items-center gap-2"><Moon className="h-4 w-4" /> Escuro</span>
          {theme === "dark" && <Check className="h-4 w-4" />}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
