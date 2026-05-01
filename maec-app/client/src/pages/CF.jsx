import React, { useState } from 'react'
import AnnualCF from './AnnualCF'
import MonthlyCF from './MonthlyCF'

const TABS = [
  { id: 'annual',  label: 'CF Năm 2026' },
  { id: 'monthly', label: 'CF Tháng 2026' },
]

export default function CF() {
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
      <div style={{ display: tab === 'annual'  ? 'block' : 'none' }}><AnnualCF /></div>
      <div style={{ display: tab === 'monthly' ? 'block' : 'none' }}><MonthlyCF /></div>
    </div>
  )
}
