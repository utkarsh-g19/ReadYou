function extractWinners(markdown) {
  const lines = markdown.split(/\r?\n/);

  const winners = [];
  let currentCategory = null;

  for (const line of lines) {
    const heading = line.match(/^(#{2,6})\s+(.+)$/);
    const embed = line.match(
      /^\s*\{% embed (https:\/\/dev\.to\/[^%\s]+) %\}\s*$/,
    );

    if (heading) {
      const level = heading[1].length;
      const title = heading[2].trim();

      if (level === 2) {
        // Major sections, including embedded article titles, end a category.
        currentCategory = null;
      } else if (level === 3) {
        // Some winner posts group awards under headings such as
        // "Featured Category Winners"; those are not individual awards.
        currentCategory = /^(featured|partner)\s+category\s+winners?$/i.test(
          title,
        )
          ? null
          : title;
      } else {
        // Nested headings contain the actual award names in grouped sections.
        currentCategory = title;
      }

      continue;
    }

    // Only collect embedded submissions inside a winner category.
    if (embed && currentCategory) {
      winners.push({
        category: currentCategory,
        submissionUrl: embed[1],
      });
    }
  }

  return winners;
}

module.exports = {
  extractWinners,
};
