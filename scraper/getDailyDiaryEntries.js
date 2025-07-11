// scraper/getDailyDiaryEntries.js
import axios from 'axios';
import * as cheerio from 'cheerio';

/**
 * Busca as entradas do diário de um usuário do Letterboxd para um dia específico.
 * @param {string} username O nome de usuário do Letterboxd.
 * @param {Date} date O objeto Date para o dia a ser verificado.
 * @returns {Array<Object>} Um array de objetos de entrada do diário para o dia.
 */
export async function getDailyDiaryEntries(username, date) {
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');

    const url = `https://letterboxd.com/${username}/films/diary/for/${year}/${month}/${day}/`;
    const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    };

    const formattedDate = `${year}-${month}-${day}`; 

    console.log(`[Scraper] Buscando diário para ${username} em ${formattedDate}...`);

    try {
        const { data } = await axios.get(url, { headers });
        const $ = cheerio.load(data);
        const diaryRows = $('tr.diary-entry-row');
        const dailyEntries = [];

        diaryRows.each((i, element) => {
            const row = $(element);
            const filmDiv = row.find('td.td-film-details .film-poster');
            
            const slug = filmDiv.attr('data-film-slug');
            const title = filmDiv.find('img').attr('alt');
            const year = row.find('.releasedate a').text().trim();
            const viewingId = row.attr('data-viewing-id');
            
            const reviewLinkElement = row.find('td.td-review a.icon-review');
            const hasReview = reviewLinkElement.length > 0;
            const reviewUrl = hasReview ? `https://letterboxd.com${reviewLinkElement.attr('href')}` : null; 

            if (slug && viewingId) {
                dailyEntries.push({
                    slug,
                    title,
                    year: year || null,
                    viewing_id: viewingId,
                    hasReview: hasReview,
                    reviewUrl: reviewUrl,
                });
            }
        });
        return dailyEntries;

    } catch (error) {
        if (error.response && error.response.status === 404) {
            console.log(`[Scraper] Nenhuma entrada encontrada para ${username} em ${formattedDate}.`);
            return [];
        }
        console.error(`[Scraper] Erro ao buscar diário para ${username} em ${formattedDate}:`, error.message);
        return [];
    }
}
