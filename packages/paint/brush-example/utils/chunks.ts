export const chunks = <T>(source: T[], chunkSize = 100): T[][] => {
  const chunks = [];
  for (let i = 0; i < source.length; i += chunkSize) {
    const chunk = source.slice(i, i + chunkSize);
    chunks.push(chunk);
  }

  return chunks;
};
