function chunkByPages(pages, size = 2500) {
  const chunks = [];

  pages.forEach((pageText, index) => {
    for (let i = 0; i < pageText.length; i += size) {
      chunks.push({
        text: pageText.slice(i, i + size),
        page: index + 1
      });
    }
  });

  return chunks;
}

module.exports = chunkByPages;
