import { useState } from 'react'

export default function EditableCell({ value, onChange, className = '', readOnly = false }) {
  const [editing, setEditing] = useState(false)
  const [local, setLocal] = useState('')

  const fmt = (v) => {
    if (v === null || v === undefined || v === '') return '-'
    const n = Number(v)
    if (isNaN(n)) return '-'
    return n.toLocaleString('vi-VN', { maximumFractionDigits: 1 })
  }

  const numVal = Number(value)
  const colorClass = !readOnly && !isNaN(numVal) && numVal < 0 ? 'negative-value' : ''

  if (readOnly) {
    return (
      <td className={`px-2 py-1 text-right text-sm font-semibold text-blue-700 bg-blue-50 ${className}`}>
        {fmt(value)}
      </td>
    )
  }

  return editing ? (
    <td className={`p-0 ${className}`}>
      <input
        autoFocus
        type="number"
        step="0.1"
        value={local}
        onChange={e => setLocal(e.target.value)}
        onBlur={() => {
          setEditing(false)
          onChange(local === '' ? 0 : Number(local))
        }}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === 'Tab') {
            setEditing(false)
            onChange(local === '' ? 0 : Number(local))
          }
          if (e.key === 'Escape') {
            setEditing(false)
          }
        }}
        className="w-full px-2 py-1 text-right border-2 border-blue-400 outline-none bg-blue-50 text-sm"
        style={{ minWidth: '80px' }}
      />
    </td>
  ) : (
    <td
      className={`px-2 py-1 text-right cursor-pointer hover:bg-yellow-50 text-sm ${colorClass} ${className}`}
      onClick={() => {
        setLocal(value ?? 0)
        setEditing(true)
      }}
    >
      {fmt(value)}
    </td>
  )
}
