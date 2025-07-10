// scraper/getWatchlist.js
import axios from 'axios';
import * as cheerio from 'cheerio';

/**
 * Raspa a watchlist completa de um usuário do Letterboxd, navegando por todas as páginas.
 * @param {string} username O nome de usuário no Letterboxd.
 * @returns {Promise<Array<string>>} Um array com todos os slugs dos filmes da watchlist.
 */
export async function getWatchlist(username) {
  let page = 1;
  const filmSlugs = [];
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
  };

  while (true) {
    // A URL da watchlist é um pouco diferente da do diário
    const url = `https://letterboxd.com/${username}/watchlist/page/${page}/`;
    
    try {
      const { data } = await axios.get(url, { headers });
      const $ = cheerio.load(data);

      const posters = $('li.poster-container .film-poster');

      // Se não houver mais pôsteres na página, chegamos ao fim.
      if (posters.length === 0) {
        break; // Sai do loop while
      }

      posters.each((i, element) => {
        const slug = $(element).attr('data-film-slug');
        if (slug) {
          filmSlugs.push(slug);
        }
      });

      // Se encontramos filmes, vamos para a próxima página.
      page++;

    } catch (error) {
      // Um erro 404 significa que a página não existe, ou seja, fim da watchlist.
      if (error.response && error.response.status === 404) {
        break; // Sai do loop while
      }
      // Outros erros devem ser registrados, mas não quebram a função.
      console.error(`Erro ao buscar a watchlist na página ${page} para ${username}:`, error.message);
      break; // Em caso de outro erro, paramos para não entrar em loop infinito.
    }
  }
  
  return filmSlugs;
}