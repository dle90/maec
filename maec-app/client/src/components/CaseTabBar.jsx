import React from 'react'

// MINERVA-style top tab bar.
// systemTabs: pinned tabs that appear first ([{id, label, icon, badge?}])
// openCases:  patient tabs that the user opens by clicking studies
// activeId:   id of the currently focused tab (matches a systemTab id or a study._id)
export default function CaseTabBar({ systemTabs = [], openCases, activeId, onSelect, onClose }) {
  const tabBtn = (active) => `px-4 py-2 text-sm border-r border-gray-200 whitespace-nowrap flex items-center gap-2 ${
    active ? 'bg-blue-50 text-blue-700 font-medium border-b-2 border-b-blue-500' : 'text-gray-600 hover:bg-gray-50'
  }`

  return (
    <div className="bg-white border-b border-gray-200 flex items-stretch overflow-x-auto">
      {systemTabs.map(t => {
        const active = activeId === t.id
        return (
          <button key={t.id} onClick={() => onSelect(t.id)} className={tabBtn(active)} title={t.label}>
            <span>{t.icon}</span>
            <span>{t.label}</span>
            {t.badge != null && t.badge > 0 && (
              <span className={`text-[10px] font-bold rounded-full min-w-[18px] h-[18px] inline-flex items-center justify-center px-1 ${
                t.badgeColor || 'bg-blue-500 text-white'
              }`}>{t.badge}</span>
            )}
          </button>
        )
      })}
      {openCases.map(c => {
        const active = activeId === c._id
        return (
          <div key={c._id} className={`flex items-center border-r border-gray-200 ${active ? 'bg-blue-50 border-b-2 border-b-blue-500' : 'hover:bg-gray-50'}`}>
            <button
              onClick={() => onSelect(c._id)}
              className={`pl-4 pr-2 py-2 text-sm whitespace-nowrap ${active ? 'text-blue-700 font-medium' : 'text-gray-600'}`}
              title={`${c.patientName} · ${c.modality} ${c.bodyPart || ''}`}
            >
              {(c.patientName || '?').toUpperCase()}
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onClose(c._id) }}
              className="px-2 py-2 text-gray-400 hover:text-red-500"
              title="Đóng tab"
            >
              ×
            </button>
          </div>
        )
      })}
    </div>
  )
}
