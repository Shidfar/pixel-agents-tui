// Skeleton until Task 8: registers /office so the module loads and validates.
import type { On } from 'claude-code'
export function register(on: On) {
  on('session.start', async ($, e, next) => {
    const started = await next(e)
    await $.command.register({ name: 'office', description: 'Toggle the pixel office pane', immediate: true })
    return started
  })
  on('command.run', { command: 'office' }, async () => ({ text: 'pixel-agents: the office is under construction' }))
}
