/** Copies `text`, falling back to a hidden textarea where the Clipboard API is unavailable (plain-HTTP LAN dev URLs). */
export async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text)
  }
  catch {
    const el = document.createElement('textarea')
    el.value = text
    document.body.append(el)
    el.select()
    document.execCommand('copy')
    el.remove()
  }
}
