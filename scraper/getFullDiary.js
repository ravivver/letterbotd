// scraper/getFullDiary.js (Versão Definitiva com Ano Corrigido)
import axios from 'axios';
import * as cheerio from 'cheerio';

export async function getFullDiary(username) {
  let page = 1;
  const allDiaryEntries = [];
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
  };

  console.log(`[Scraper] Iniciando busca no diário completo de ${username}...`);

  while (true) {
    const url = `https://letterboxd.com/${username}/films/diary/page/${page}/`;
    
    try {
      const { data } = await axios.get(url, { headers });
      const $ = cheerio.load(data);
      const diaryRows = $('tr.diary-entry-row');

      if (diaryRows.length === 0) {
        console.log(`[Scraper] Finalizado. Encontradas ${allDiaryEntries.length} entradas em ${page - 1} páginas para ${username}.`);
        break;
      }

      diaryRows.each((i, element) => {
        const row = $(element);
        const filmDiv = row.find('td.td-film-details .film-poster');
        
        const slug = filmDiv.attr('data-film-slug');
        const title = filmDiv.find('img').attr('alt');
        const date = row.attr('data-viewing-date');

        // --- CORREÇÃO FINAL AQUI ---
        // Buscando o ano no local correto que você encontrou: <span class="releasedate"><a>ANO</a></span>
        const year = row.find('.releasedate a').text().trim();

        const ratingSpan = row.find('td.td-rating span.rating');
        let rating = null;
        const ratingClass = ratingSpan.attr('class');
        if (ratingClass) {
            const ratingMatch = ratingClass.match(/rated-(\d+)/);
            if (ratingMatch) {
                rating = parseInt(ratingMatch[1], 10) / 2;
            }
        }

        if (slug) {
          allDiaryEntries.push({ slug, title, year: year || null, rating, date });
        }
      });
      
      page++;

    } catch (error) {
      if (error.response && error.response.status === 404) {
        console.log(`[Scraper] Finalizado na página ${page}. Encontradas ${allDiaryEntries.length} entradas no total para ${username}.`);
        break;
      }
      console.error(`[Scraper] Erro ao buscar diário na página ${page} para ${username}:`, error.message);
      break; 
    }
  }

  return allDiaryEntries;
}