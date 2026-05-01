import React, { useState } from 'react'
import AnnualPL from './AnnualPL'
import MonthlyPL from './MonthlyPL'
import SitePL from './SitePL'

const TABS = [
  { id: 'annual',  label: 'P&L Năm 2025' },
  { id: 'monthly', label: 'P&L Tháng 2025' },
  { id: 'site',    label: 'P&L Chi nhánh' },
]

export default function PL() {
  const [tab, setTab] = useState('annual')

  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === t.id
                ? 'bg-blue-700 text-white'
                : 'bg-white text-gray-600 hover:bg-gray-50 border border-gray-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div style={{ display: tab === 'annual'  ? 'block' : 'none' }}><AnnualPL /></div>
      <div style={{ display: tab === 'monthly' ? 'block' : 'none' }}><MonthlyPL /></div>
      <div style={{ display: tab === 'site'    ? 'block' : 'none' }}><SitePL /></div>
    </div>
  )
}
