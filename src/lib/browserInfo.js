/**
 * "Chrome 130 · Windows" from the user agent. Shared by the staff QcCapture
 * and the public /conceptual_budget bug button (Mike 10-15: the public button
 * captures the same things as the internal one). Browser-only: reads
 * navigator, so call it from an event handler, never during render on the server.
 */
export function parseBrowserInfo(userAgent) {
  const ua = String(userAgent ?? (typeof navigator !== 'undefined' ? navigator.userAgent : '') ?? '');
  let browser = 'Unknown';
  if (ua.includes('Edg/'))          browser = `Edge ${(ua.match(/Edg\/([\d]+)/) || [])[1] || ''}`;
  else if (ua.includes('Chrome/'))  browser = `Chrome ${(ua.match(/Chrome\/([\d]+)/) || [])[1] || ''}`;
  else if (ua.includes('Firefox/')) browser = `Firefox ${(ua.match(/Firefox\/([\d]+)/) || [])[1] || ''}`;
  else if (ua.includes('Safari/'))  browser = `Safari ${(ua.match(/Version\/([\d]+)/) || [])[1] || ''}`;
  let os = '';
  if (ua.includes('Windows'))       os = 'Windows';
  else if (ua.includes('iPhone') || ua.includes('iPad')) os = 'iOS';
  else if (ua.includes('Android'))  os = 'Android';
  else if (ua.includes('Mac'))      os = 'macOS';
  else if (ua.includes('Linux'))    os = 'Linux';
  return [browser.trim(), os].filter(Boolean).join(' · ');
}
