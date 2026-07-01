export function getSafeInitials(displayName) {
  if (!displayName || typeof displayName !== 'string') return '?';
  
  // Remove everything that is not a Letter (\p{L}), Number (\p{N}), or Space (\s)
  // This automatically strips emojis, special symbols like |, -, emojis, etc.
  let sanitizedName = displayName.replace(/[^\p{L}\p{N}\s]/gu, '').trim();

  if (!sanitizedName) {
     console.log(`[AvatarFallback] rawDisplayName="${displayName}", sanitizedName="", initials="?", fallbackReason="No valid characters left after strip"`);
     return '?';
  }

  // Get words and extract the first letter of each word (max 2)
  const words = sanitizedName.split(/\s+/);
  let initials = '';
  
  // Use Array.from to safely extract the first Unicode character from each word
  for (let i = 0; i < Math.min(2, words.length); i++) {
    const chars = Array.from(words[i]);
    if (chars.length > 0) {
      initials += chars[0];
    }
  }

  initials = initials.toUpperCase();
  
  if (!initials) {
      console.log(`[AvatarFallback] rawDisplayName="${displayName}", sanitizedName="${sanitizedName}", initials="?", fallbackReason="Extraction failed"`);
      return '?';
  }

  console.log(`[AvatarFallback] rawDisplayName="${displayName}", sanitizedName="${sanitizedName}", initials="${initials}", fallbackReason="Success"`);
  return initials;
}
