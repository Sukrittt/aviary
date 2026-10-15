import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { BugReportForm } from './FeedbackPage'

const submitFeedback = vi.fn()
vi.mock('../api/feedback', () => ({ submitFeedback: (...args: unknown[]) => submitFeedback(...args) }))
vi.mock('../lib/analytics', () => ({ track: vi.fn() }))
const dataUrlFromFile = vi.fn()
vi.mock('../features/scan-bill/image', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../features/scan-bill/image')>()),
  dataUrlFromFile: (...args: unknown[]) => dataUrlFromFile(...args),
}))

beforeEach(() => {
  submitFeedback.mockReset().mockResolvedValue(undefined)
  dataUrlFromFile.mockReset().mockResolvedValue('data:image/jpeg;base64,c2hvdA==')
})

function fill() {
  fireEvent.change(screen.getByPlaceholderText("What's broken?"), { target: { value: 'Chart overlaps' } })
  fireEvent.change(screen.getByPlaceholderText('What happened, and what did you expect instead?'), { target: { value: 'On Insights' } })
}

it('warns that screenshots can show amounts', () => {
  render(<BugReportForm onDone={vi.fn()} />)
  expect(screen.getByText(/Turn on Hide amounts in your account settings/)).toBeInTheDocument()
})

it('sends a picked screenshot as base64 JPEG', async () => {
  render(<BugReportForm onDone={vi.fn()} />)
  const file = new File(['x'], 'shot.png', { type: 'image/png' })
  fireEvent.change(screen.getByLabelText('Choose a screenshot'), { target: { files: [file] } })
  expect(await screen.findByRole('img', { name: 'Your screenshot' })).toBeInTheDocument()
  expect(dataUrlFromFile).toHaveBeenCalledWith(file)
  fill()
  fireEvent.click(screen.getByRole('button', { name: 'Send report' }))
  await waitFor(() => expect(submitFeedback).toHaveBeenCalledWith('bug', 'Chart overlaps', 'On Insights', { image: 'c2hvdA==', mimeType: 'image/jpeg' }))
})

it('sends without a screenshot once it is removed', async () => {
  render(<BugReportForm onDone={vi.fn()} />)
  fireEvent.change(screen.getByLabelText('Choose a screenshot'), { target: { files: [new File(['x'], 'shot.png')] } })
  fireEvent.click(await screen.findByRole('button', { name: 'Remove screenshot' }))
  expect(screen.getByRole('button', { name: 'Add a screenshot' })).toBeInTheDocument()
  fill()
  fireEvent.click(screen.getByRole('button', { name: 'Send report' }))
  await waitFor(() => expect(submitFeedback).toHaveBeenCalledWith('bug', 'Chart overlaps', 'On Insights', undefined))
})

it('shows written copy when an image cannot be read', async () => {
  dataUrlFromFile.mockRejectedValue(new Error('decode failed'))
  render(<BugReportForm onDone={vi.fn()} />)
  fireEvent.change(screen.getByLabelText('Choose a screenshot'), { target: { files: [new File(['x'], 'bad.heic')] } })
  expect(await screen.findByText("Couldn't read that image. Try another one.")).toBeInTheDocument()
})

it('says the screenshot is too big instead of blaming the connection', async () => {
  submitFeedback.mockRejectedValue(new Error('too_large'))
  render(<BugReportForm onDone={vi.fn()} />)
  fireEvent.change(screen.getByLabelText('Choose a screenshot'), { target: { files: [new File(['x'], 'huge.png')] } })
  await screen.findByRole('img', { name: 'Your screenshot' })
  fill()
  fireEvent.click(screen.getByRole('button', { name: 'Send report' }))
  expect(await screen.findByText("That screenshot's too big. Crop it or try a smaller one.")).toBeInTheDocument()
})
