import { QueryClient, useQueryClient } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { useTheme } from 'styled-components'
import { expect, it, vi } from 'vitest'
import { GlobalStyles, theme } from '../design-system/mocks'
import { queryClient } from '../lib/queryClient'
import { AppProviders } from './AppProviders'

vi.mock('../design-system', () => import('../design-system/mocks'))

function Probe() {
  const client = useQueryClient()
  const currentTheme = useTheme()
  return (
    <p>
      {client === queryClient ? 'default client' : 'custom client'}
      {currentTheme === theme ? ' app theme' : ' other theme'}
    </p>
  )
}

it('provides the shared query client, the theme and global styles', () => {
  render(
    <AppProviders>
      <Probe />
    </AppProviders>,
  )
  expect(screen.getByText('default client app theme')).toBeVisible()
  expect(GlobalStyles).toHaveBeenCalled()
})

it('uses a custom query client when one is given', () => {
  const client = new QueryClient()
  function CustomProbe() {
    return <p>{useQueryClient() === client ? 'injected' : 'other'}</p>
  }
  render(
    <AppProviders client={client}>
      <CustomProbe />
    </AppProviders>,
  )
  expect(screen.getByText('injected')).toBeVisible()
})
