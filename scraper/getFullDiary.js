// scraper/getFullDiary.js (Com viewing_id)
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
                break; // Não há mais entradas, para de buscar
            }

            diaryRows.each((i, element) => {
                const row = $(element);
                const filmDiv = row.find('td.td-film-details .film-poster');
                const slug = filmDiv.attr('data-film-slug');
                const title = filmDiv.find('img').attr('alt');
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

                // --- EXTRAÇÃO DE DATA E AGORA O VIEWING_ID ---
                const dateLinkHref = row.find('td.td-day a').attr('href'); 
                const viewingId = row.attr('data-viewing-id'); // <-- NOVO: Extrai o data-viewing-id
                
                let formattedDate = null;

                if (dateLinkHref) {
                    const dateParts = dateLinkHref.match(/\/(\d{4})\/(\d{2})\/(\d{2})\/$/);
                    if (dateParts && dateParts.length === 4) {
                        formattedDate = `${dateParts[1]}-${dateParts[2]}-${dateParts[3]}`;
                        try {
                            // Apenas para validação, não comparação direta aqui
                            new Date(formattedDate); 
                            console.log(`[Scraper Debug] Entrada ${i} - Título: ${title}, Viewing ID: '${viewingId}', Formatted Date: '${formattedDate}'`);
                        } catch (e) {
                            console.warn(`[Scraper] Erro ao criar objeto Date para '${formattedDate}' de '${title}': ${e.message}. Usando null.`);
                            formattedDate = null;
                        }
                    } else {
                        console.warn(`[Scraper] Formato de data inesperado no href para '${title}': '${dateLinkHref}'. Usando null.`);
                    }
                } else {
                    console.warn(`[Scraper] Link de data (td.td-day a) não encontrado para '${title}'.`);
                }

                // Se não há viewingId ou data, pulamos essa entrada
                if (!viewingId || !formattedDate) { 
                    console.warn(`[Scraper] Pulando entrada '${title}' devido a Viewing ID ou data inválida/ausente.`);
                    return true; // Continua para a próxima entrada no loop .each
                }

                if (slug) {
                    allDiaryEntries.push({ slug, title, year: year || null, rating, date: formattedDate, viewing_id: viewingId });
                }
            });
            
            page++; 
        } catch (error) {
            if (error.response && error.response.status === 404) {
                console.log(`[Scraper] Finalizado na página ${page}. Encontradas ${allDiaryEntries.length} entradas no total para ${username}.`);
                break;
            }
            console.error(`[Scraper] Erro fatal durante a busca do diário na página ${page} para ${username}:`, error.message);
            console.error(error); 
            break; 
        }
    }

    return allDiaryEntries;
}
