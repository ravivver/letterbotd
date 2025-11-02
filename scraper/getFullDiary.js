import axios from 'axios';
import * as cheerio from 'cheerio';

export async function getFullDiary(username) {
    let page = 1;
    const allDiaryEntries = [];
    const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    };

    console.log(`[Scraper] Starting full diary fetch for ${username}...`);

    while (true) {
        const url = `https://letterboxd.com/${username}/films/diary/page/${page}/`;

        try {
            const { data } = await axios.get(url, { headers });
            const $ = cheerio.load(data);
            // O seletor para a linha principal está correto
            const diaryRows = $('tr.diary-entry-row');

            if (diaryRows.length === 0) {
                console.log(`[Scraper] Finished. Found ${allDiaryEntries.length} entries on ${page - 1} pages for ${username}.`);
                break; 
            }

            diaryRows.each((i, element) => {
                const row = $(element);
                
                // CORREÇÃO: Busca o elemento pai que contém os atributos de dados do filme (data-item-slug)
                const componentFigure = row.find('div.react-component.figure[data-item-slug]').first();
                
                if (componentFigure.length === 0) {
                    console.warn(`[Scraper] Skipping entry: Could not find film data component with slug.`);
                    return true; // Continua para a próxima linha
                }

                // Extração dos dados do atributo, que é mais estável
                const slug = componentFigure.attr('data-item-slug');
                const titleWithYear = componentFigure.attr('data-item-name');
                const viewingId = row.attr('data-viewing-id'); 
                
                // Extrai o ano da coluna 'Released' (col-releaseyear)
                const year = row.find('.col-releaseyear span').text().trim(); 

                // Extração da nota (busca o valor no atributo aria-valuenow ou value)
                let rating = null;
                const ratingRangeElement = row.find('.rateit-range[aria-valuenow]').first();
                const ratingInputField = row.find('input.rateit-field[type="range"]').first();
                
                if (ratingRangeElement.length) {
                    rating = parseInt(ratingRangeElement.attr('aria-valuenow'), 10) / 2;
                } else if (ratingInputField.length) {
                    rating = parseInt(ratingInputField.val(), 10) / 2;
                }

                // Extrai a data do link do dia
                const dateLinkHref = row.find('td.col-daydate a').attr('href'); 
                let formattedDate = null;

                if (dateLinkHref) {
                    const dateParts = dateLinkHref.match(/\/(\d{4})\/(\d{2})\/(\d{2})\/$/);
                    if (dateParts && dateParts.length === 4) {
                        formattedDate = `${dateParts[1]}-${dateParts[2]}-${dateParts[3]}`;
                    }
                }
                
                // Limpa o título do poster (Ex: Outcast Rockstar (2019) -> Outcast Rockstar)
                let cleanTitle = titleWithYear;
                if (cleanTitle && year && cleanTitle.endsWith(`(${year})`)) {
                    cleanTitle = cleanTitle.substring(0, cleanTitle.length - `(${year})`.length).trim();
                }
                

                if (!viewingId || !formattedDate) { 
                    console.warn(`[Scraper] Skipping entry '${cleanTitle}' due to invalid/missing Viewing ID or date.`);
                    return true; 
                }

                if (slug) {
                    allDiaryEntries.push({ 
                        slug, 
                        title: cleanTitle || titleWithYear, 
                        year: year || null, 
                        rating, 
                        date: formattedDate, 
                        viewing_id: viewingId 
                    });
                }
            });
            
            page++; 
            // Pequena pausa para evitar sobrecarregar o servidor
            await new Promise(resolve => setTimeout(resolve, 500)); 
        } catch (error) {
            if (error.response && error.response.status === 404) {
                console.log(`[Scraper] Finished on page ${page}. Found ${allDiaryEntries.length} entries in total for ${username}.`);
                break;
            }
            console.error(`[Scraper] Fatal error during diary fetch on page ${page} for ${username}:`, error.message);
            break; 
        }
    }

    return allDiaryEntries;
}