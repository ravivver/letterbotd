// scraper/searchLetterboxd.js
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

    // Processar resultados de FILMES
    if (filmResponse && filmResponse.status === 200) {
      const $ = cheerio.load(filmResponse.data);
      $('li.search-result.-production').each((i, element) => {
        const posterDiv = $(element).find('div.film-poster');
        const title = posterDiv.find('img').attr('alt');
        const slug = posterDiv.attr('data-film-slug');
        const year = $(element).find('h2.headline-2 a small.metadata').text();
        if (title && slug) {
          results.push({ type: 'film', title, year, slug });
        }
      });
    }

    // Processar resultados de PESSOAS (Diretores)
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
    console.error(`Erro fatal ao buscar por "${query}" no Letterboxd:`, error.message);
    return [];
  }
}

/**
 * Raspa os filmes da página de um diretor usando o endpoint AJAX correto.
 * @param {string} directorPageUrl A URL relativa da página do diretor.
 * @returns {Promise<Array<Object>>} Uma lista de filmes do diretor.
 */
export async function getDirectorFilms(directorPageUrl) {
    // O endpoint correto é a URL da página de filmes do diretor
    const url = `https://letterboxd.com${directorPageUrl}films/`; 
    const films = [];
    const headers = {
        'X-Requested-With': 'XMLHttpRequest', // O cabeçalho mágico é necessário aqui também
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    };

    try {
        const { data } = await axios.get(url, { headers });
        // A resposta aqui também é o HTML direto da lista de filmes
        const $ = cheerio.load(data);
        $('li.poster-container').each((i, element) => {
            const posterDiv = $(element).find('div.film-poster');
            const title = posterDiv.find('img').attr('alt'); // Usar o 'alt' da imagem é mais confiável
            const slug = posterDiv.attr('data-film-slug');
            if(title && slug) { 
                films.push({ title, slug: `/film/${slug}/` }); // Garantir que o slug tenha o formato de link
            }
        });
        return films;
    } catch (error) {
        console.error(`Erro ao buscar filmes do diretor em ${url}:`, error.message);
        return [];
    }
}