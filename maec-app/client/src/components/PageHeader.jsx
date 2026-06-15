import { useContext } from 'react'
import { createPortal } from 'react-dom'
import { PageHeaderSlotContext } from './Layout'

// Render page-level controls into the global top header so a page doesn't need
// its own second toolbar bar. Usage: <PageHeader>{...controls...}</PageHeader>.
// Renders nothing until the Layout header slot is mounted.
export default function PageHeader({ children }) {
  const slot = useContext(PageHeaderSlotContext)
  return slot ? createPortal(children, slot) : null
}
