// scraper/checkFilmInDiary.js (Versão Final com Data do Link)
import axios from 'axios';
import * as cheerio from 'cheerio';

export async function checkFilmInDiary(username, filmSlug) {
  let page = 1;
  const headers = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36' };

  while (true) {
    const url = `https://letterboxd.com/${username}/films/diary/page/${page}/`;
    
    try {
      const { data } = await axios.get(url, { headers });
      const $ = cheerio.load(data);
      const diaryEntries = $('tr.diary-entry-row');

      if (diaryEntries.length === 0) return { watched: false };

      let foundFilm = null;
      diaryEntries.each((i, element) => {
        const row = $(element);
        const currentSlug = row.find('td.td-film-details .film-poster').attr('data-film-slug');

        if (currentSlug === filmSlug) {
          const ratingSpan = row.find('td.td-rating span.rating');
          
          // --- LÓGICA DE DATA CORRIGIDA ---
          // Prioridade 1: Atributo data-viewing-date (mais confiável)
          let dateStr = row.attr('data-viewing-date');
          
          // Prioridade 2: Extrair do href do link do dia (seu achado!)
          if (!dateStr) {
            const dayLink = row.find('td.td-day a').attr('href');
            if (dayLink) {
              const dateParts = dayLink.match(/(\d{4})\/(\d{2})\/(\d{2})/);
              if (dateParts) {
                dateStr = `${dateParts[1]}-${dateParts[2]}-${dateParts[3]}`;
              }
            }
          }
          
          let rating = null;
          const ratingClass = ratingSpan.attr('class');
          if (ratingClass) {
              const ratingMatch = ratingClass.match(/rated-(\d+)/);
              if (ratingMatch) {
                  rating = (parseInt(ratingMatch[1], 10) / 2); // Mantém como número para facilitar
              }
          }

          foundFilm = { watched: true, rating: rating, date: dateStr };
          return false;
        }
      });

      if (foundFilm) return foundFilm;
      page++;

    } catch (error) {
      if (error.response && error.response.status === 404) return { watched: false };
      console.error(`Erro ao verificar diário na página ${page} para ${username}:`, error.message);
      return { watched: false, error: true };
    }
  }
}