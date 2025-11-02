import axios from 'axios';
import * as cheerio from 'cheerio';

export async function getWatchlist(username) {
  let page = 1;
  const filmSlugs = [];
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
  };

  while (true) {
    const url = `https://letterboxd.com/${username}/watchlist/page/${page}/`;
    
    try {
      const { data } = await axios.get(url, { headers });
      const $ = cheerio.load(data);

      const posters = $('ul.poster-list li .film-poster[data-film-slug]');;

      if (posters.length === 0) {
        break;
      }

      posters.each((i, element) => {
        const slug = $(element).attr('data-film-slug');
        if (slug) {
          filmSlugs.push(slug);
        }
      });

      page++;

    } catch (error) {
      if (error.response && error.response.status === 404) {
        break;
      }
      console.error(`Error fetching watchlist on page ${page} for ${username}:`, error.message);
      break;
    }
  }
  
  return filmSlugs;
}