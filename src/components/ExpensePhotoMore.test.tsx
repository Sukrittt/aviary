import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { ExpensePhotoMore } from './ExpensePhotoMore'

it('keeps the photo control hidden until More is opened', () => {
  const onOpen = vi.fn()
  render(<ExpensePhotoMore photoUrl={null} onOpen={onOpen} onPick={vi.fn()} onRemove={vi.fn()} />)

  expect(screen.queryByRole('button', { name: 'Add a photo' })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'More' }))
  expect(onOpen).toHaveBeenCalledOnce()
  expect(screen.getByRole('button', { name: 'Add a photo' })).toBeInTheDocument()
})

it('hands a picked file over, and shows a picked photo with remove', () => {
  const onPick = vi.fn()
  const onRemove = vi.fn()
  const { rerender } = render(<ExpensePhotoMore photoUrl={null} onPick={onPick} onRemove={onRemove} />)
  fireEvent.click(screen.getByRole('button', { name: 'More' }))

  const file = new File(['x'], 'plant.jpg', { type: 'image/jpeg' })
  fireEvent.change(screen.getByLabelText('Choose a photo'), { target: { files: [file] } })
  expect(onPick).toHaveBeenCalledWith(file)

  rerender(<ExpensePhotoMore photoUrl="data:image/jpeg;base64,eA==" onPick={onPick} onRemove={onRemove} />)
  expect(screen.getByRole('img', { name: 'Expense photo' })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Remove' }))
  expect(onRemove).toHaveBeenCalledOnce()
})

it('hints at a saved photo on the closed toggle', () => {
  render(<ExpensePhotoMore photoUrl={null} hasPhoto onPick={vi.fn()} onRemove={vi.fn()} />)
  expect(screen.getByRole('button', { name: 'More · 1 photo' })).toBeInTheDocument()
})
