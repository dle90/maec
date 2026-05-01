import React from 'react'
import { useAuth } from '../context/AuthContext'

export default function Dashboard() {
  const { auth } = useAuth()
  const name = auth?.displayName || auth?.username || ''

  return (
    <div className="flex items-center justify-center min-h-[70vh]">
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 px-10 py-8 max-w-xl w-full text-center">
        <h1 className="text-2xl font-bold text-gray-800">Phòng khám Mắt Minh Anh</h1>
        <p className="text-sm text-gray-500 mt-1">Hệ thống quản lý lâm sàng</p>

        {name && (
          <p className="text-base text-gray-700 mt-6">
            Xin chào, <span className="font-semibold">{name}</span>
          </p>
        )}

        <p className="text-sm text-gray-500 mt-4">
          Chọn một mục từ menu bên trái để bắt đầu.
        </p>
      </div>
    </div>
  )
}
