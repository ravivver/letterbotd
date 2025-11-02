// searchLetterboxd.js (CÓDIGO CORRIGIDO)
import axios from 'axios';
import * as cheerio from 'cheerio';

export async function searchLetterboxd(query) {
  const formattedQuery = encodeURIComponent(query);
  const results = [];
  const headers = {
    'X-Requested-With': 'XMLHttpRequest',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
  };

  try {
    const [filmResponse, personResponse] = await Promise.all([
      axios.get(`https://letterboxd.com/s/search/films/${formattedQuery}/`, { headers }).catch(() => null),
      axios.get(`https://letterboxd.com/s/search/cast-crew/${formattedQuery}/`, { headers }).catch(() => null)
    ]);

    if (filmResponse && filmResponse.status === 200) {
      const $ = cheerio.load(filmResponse.data);
      $('li.search-result.-production').each((i, element) => {
        const posterDiv = $(element).find('div.film-poster');
        const slug = posterDiv.attr('data-film-slug');
        
        if (slug) {
            const titleElement = $(element).find('h2.headline-2 a');
            const yearTextElement = titleElement.find('small.metadata');
            const year = yearTextElement.text().trim().replace(/[\(\)]/g, ''); 
            
            let title = titleElement.text().trim();
            if (year) {
                title = title.replace(`(${year})`, '').trim();
            }

            if (title) {
                results.push({ type: 'film', title, year, slug });
            }
        }
      });
    }

    if (personResponse && personResponse.status === 200) {
      const $ = cheerio.load(personResponse.data);
      $('li.search-result.-contributor').each((i, element) => {
        const link = $(element).find('h2.title-2 a');
        const name = link.text().trim();
        const pageUrl = link.attr('href');
        if (name && pageUrl && pageUrl.startsWith('/director/')) {
          results.push({ type: 'director', name, pageUrl });
        }
      });
    }

    results.sort((a, b) => {
        if (a.type === 'director' && b.type !== 'director') return -1;
        if (a.type !== 'director' && b.type === 'director') return 1;
        return 0;
    });

    return results.slice(0, 25);

  } catch (error) {
    console.error(`Fatal error searching for "${query}" on Letterboxd:`, error.message);
    return [];
  }
}

export async function getDirectorFilms(directorPageUrl) {
    const url = `https://letterboxd.com${directorPageUrl}films/`; 
    const films = [];
    const headers = {
        'X-Requested-With': 'XMLHttpRequest',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    };

    try {
        const { data } = await axios.get(url, { headers });
        const $ = cheerio.load(data);
        $('li.poster-container').each((i, element) => {
            const posterDiv = $(element).find('div.film-poster');
            const title = posterDiv.find('img').attr('alt');
            const slug = posterDiv.attr('data-film-slug');
            if(title && slug) { 
                films.push({ title, slug: `/film/${slug}/` });
            }
        });
        return films;
    } catch (error) {
        console.error(`Error fetching director's films at ${url}:`, error.message);
        return [];
    }
}