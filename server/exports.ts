export const csvCell = (value: unknown) => {
  let cell = String(value ?? '')
  if (/^[=+\-@\t\r\n]/.test(cell.trimStart())) cell = `'${cell}`
  return `"${cell.replaceAll('"', '""')}"`
}
