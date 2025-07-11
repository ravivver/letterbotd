// scraper/getWatchlist.js

import axios from 'axios';
import * as cheerio from 'cheerio';

/**
 * Scrapes a user's complete Letterboxd watchlist, navigating through all pages.
 * @param {string} username The Letterboxd username.
 * @returns {Promise<Array<string>>} An array with all film slugs from the watchlist.
 */
export async function getWatchlist(username) {
  let page = 1;
  const filmSlugs = [];
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
  };

  while (true) {
    // The watchlist URL is slightly different from the diary URL
    const url = `https://letterboxd.com/${username}/watchlist/page/${page}/`;
    
    try {
      const { data } = await axios.get(url, { headers });
      const $ = cheerio.load(data);

      const posters = $('li.poster-container .film-poster');

      // If there are no more posters on the page, we've reached the end.
      if (posters.length === 0) {
        break; // Exit the while loop
      }

      posters.each((i, element) => {
        const slug = $(element).attr('data-film-slug');
        if (slug) {
          filmSlugs.push(slug);
        }
      });

      // If we found films, go to the next page.
      page++;

    } catch (error) {
      // A 404 error means the page does not exist, i.e., end of the watchlist.
      if (error.response && error.response.status === 404) {
        break; // Exit the while loop
      }
      // Other errors should be logged, but not break the function.
      console.error(`Error fetching watchlist on page ${page} for ${username}:`, error.message); // Translated
      break; // In case of other error, we stop to avoid infinite loop.
    }
  }
  
  return filmSlugs;
}
