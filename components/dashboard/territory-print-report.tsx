"use client"

import React from "react"
import { FieldMapLogoBrand } from "@/components/icons/fieldmap-logo"
import { formatSafeDate } from "@/lib/date-utils"

interface PrintableTerritory {
  id: string
  number: string
  name: string
  lastCompletedAt: string | null
  completionsInPeriod: number
}

interface TerritoryPrintReportProps {
  data: PrintableTerritory[]
  campaignName?: string
}

export function TerritoryPrintReport({ data, campaignName }: TerritoryPrintReportProps) {
  const today = new Date().toLocaleDateString("pt-BR")

  return (
    <div className="hidden print:block bg-white p-10 text-slate-900 font-sans w-full max-w-[210mm] mx-auto min-h-screen relative">
      {/* Ultra Minimal Header */}
      <div className="flex items-center justify-between mb-8 border-b-2 border-slate-900 pb-4">
        <div className="flex items-center gap-3">
          <FieldMapLogoBrand className="h-10 w-10 text-[#C65D3B]" />
          <div>
            <h1 className="text-xl font-black uppercase tracking-tighter leading-none text-slate-900">Relatório de Territórios</h1>
            {campaignName && (
              <p className="text-[0.625rem] font-bold text-slate-500 mt-1 uppercase tracking-widest">
                Campanha: {campaignName}
              </p>
            )}
          </div>
        </div>
        <div className="text-right">
          <p className="text-xs font-black mt-1 text-slate-900 leading-none">{today}</p>
        </div>
      </div>

      {/* Single Column Layout */}
      <div className="w-full">
        <table className="w-full border-collapse text-[0.6875rem]">
          <thead>
            <tr className="border-b-2 border-slate-800">
              <th className="py-2 text-left font-black uppercase tracking-tighter text-slate-400 w-24">Nº / Nome</th>
              <th className="py-2 text-left font-black uppercase tracking-tighter text-slate-400"></th>
              <th className="py-2 text-center font-black uppercase tracking-tighter text-slate-400 w-32">Última Conclusão</th>
              <th className="py-2 text-right font-black uppercase tracking-tighter text-slate-400 w-20">Vezes (6m)</th>
            </tr>
          </thead>
          <tbody>
            {data.map((t, idx) => (
              <tr 
                key={t.id} 
                className={`border-b border-slate-100 ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'}`}
              >
                <td className="py-2 font-black text-slate-900 text-xs w-12">
                  {t.number}
                </td>
                <td className="py-2">
                  <span className="font-bold text-slate-700 uppercase tracking-tight">
                    {t.name}
                  </span>
                </td>
                <td className="py-2 text-center font-mono font-bold text-slate-500">
                  {t.lastCompletedAt ? formatSafeDate(t.lastCompletedAt) : "—"}
                </td>
                <td className="py-2 text-right font-black text-slate-900 text-sm">
                  {t.completionsInPeriod}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modern Signature Seal / Watermark */}
      <div className="absolute bottom-10 right-10 grayscale opacity-15">
        <FieldMapLogoBrand className="h-20 w-20" />
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          @page { 
            size: A4 portrait; 
            margin: 0 !important;
          }
           
          html, body {
            height: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
          }

          /* Hide UI JUNK */
          div[role="dialog"], 
          header, 
          aside, 
          nav, 
          button, 
          .print\\:hidden,
          [class*="sidebar"],
          [class*="DashboardLayout"],
          .fixed { 
            display: none !important; 
          }

          .print\\:block {
            display: block !important;
            position: absolute !important;
            top: 0 !important;
            left: 0 !important;
            width: 100% !important;
            height: 100% !important;
            background: white !important;
            z-index: 9999 !important;
          }
          
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          
          /* Evitar quebras de linha dentro das linhas da tabela */
          tr { page-break-inside: avoid !important; }
        }
      `}} />
    </div>
  )
}



