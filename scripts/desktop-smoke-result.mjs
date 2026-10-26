// A clean exit can also mean a second instance immediately quit. Require proof
// that the renderer reached Nibble's onboarding or home screen.
export function renderedApplication(output) {
  let verified = false;
  for (const line of output.split(/\r?\n/)) {
    if (!line.startsWith('NIBBLE_SMOKE ')) continue;
    try {
      const result = JSON.parse(line.slice('NIBBLE_SMOKE '.length));
      const titleMatches = ['Nibble', 'Nibble — Your recipe collection'].includes(result.title);
      const text = typeof result.text === 'string' ? result.text : '';
      const onboarding = text.includes('What should we call your kitchen?') && text.includes('Make yourself at home');
      const home = text.includes('Welcome to your kitchen') && text.includes('Import Recipe');
      verified = titleMatches && (onboarding || home);
    } catch { verified = false; }
  }
  return verified;
}

export function desktopSmokePassed(output, code, signal, timedOut = false) {
  return code === 0 && !signal && !timedOut && renderedApplication(output);
}
