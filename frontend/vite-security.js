// Vite runs as the store owner: block private files even if Unix permissions allow reads.
// The first four entries retain Vite's standard secret-file exclusions.
export const privateFilePatterns = [
  ".env",
  ".env.*",
  "*.{crt,pem,key}",
  "**/.git/**",
  "**/.data/**",
  "**/.netlify/**",
  "**/backend/**",
];
