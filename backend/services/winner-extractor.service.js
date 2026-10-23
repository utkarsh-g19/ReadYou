function extractWinners(markdown) {
  const lines = markdown.split(/\r?\n/);

  const winners = [];
  let currentCategory = null;

  for (const line of lines) {
    const sectionHeading = line.match(/^##\s+(.+)$/);
    const categoryHeading = line.match(/^###\s+(.+)$/);
    const embed = line.match(
      /^\s*\{% embed (https:\/\/dev\.to\/[^%\s]+) %\}\s*$/,
    );

    // Leaving a major section means the previous category ends.
    if (sectionHeading) {
      currentCategory = null;
      continue;
    }

    // Each third-level heading identifies a winner category.
    if (categoryHeading) {
      currentCategory = categoryHeading[1].trim();
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
