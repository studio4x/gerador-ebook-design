const { join } = require('path');

/**
 * @type {import("puppeteer").Configuration}
 */
module.exports = {
  // Set the cache directory to be local to the project
  cacheDirectory: join(__dirname, '.cache', 'puppeteer'),
};
