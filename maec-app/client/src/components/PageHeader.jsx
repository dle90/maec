import { useContext, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { PageHeaderSlotContext } from './Layout'

// Render page-level controls into the global top header so a page doesn't need
// its own second toolbar bar. Usage: <PageHeader>{...controls...}</PageHeader>.
// Renders nothing until the Layout header slot is mounted; registers itself so
// Layout can compact the brand title to make room for the page's controls.
export default function PageHeader({ children }) {
  const ctx = useContext(PageHeaderSlotContext)
  const register = ctx?.register
  useEffect(() => (register ? register() : undefined), [register])
  return ctx?.slot ? createPortal(children, ctx.slot) : null
}
