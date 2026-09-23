/** Show a short message at the bottom of the screen (rendered by <Toaster />). */
export function toast(message, tone = 'success') {
  window.dispatchEvent(new CustomEvent('cwi:toast', { detail: { message, tone } }))
}
