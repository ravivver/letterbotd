// scraper/getFullDiary.js (With viewing_id - Translated to English)
import axios from 'axios';
import * as cheerio from 'cheerio';

export async function getFullDiary(username) {
    let page = 1;
    const allDiaryEntries = [];
    const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    };

    console.log(`[Scraper] Starting full diary fetch for ${username}...`); // Translated

    while (true) {
        const url = `https://letterboxd.com/${username}/films/diary/page/${page}/`;

        try {
            const { data } = await axios.get(url, { headers });
            const $ = cheerio.load(data);
            const diaryRows = $('tr.diary-entry-row');

            if (diaryRows.length === 0) {
                console.log(`[Scraper] Finished. Found ${allDiaryEntries.length} entries on ${page - 1} pages for ${username}.`); // Translated
                break; 
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

                // --- DATE AND VIEWING_ID EXTRACTION ---
                const dateLinkHref = row.find('td.td-day a').attr('href'); 
                const viewingId = row.attr('data-viewing-id'); 
                
                let formattedDate = null;

                if (dateLinkHref) {
                    const dateParts = dateLinkHref.match(/\/(\d{4})\/(\d{2})\/(\d{2})\/$/);
                    if (dateParts && dateParts.length === 4) {
                        formattedDate = `${dateParts[1]}-${dateParts[2]}-${dateParts[3]}`;
                        try {
                            new Date(formattedDate); 
                            console.log(`[Scraper Debug] Entry ${i} - Title: ${title}, Viewing ID: '${viewingId}', Formatted Date: '${formattedDate}'`); // Translated
                        } catch (e) {
                            console.warn(`[Scraper] Error creating Date object for '${formattedDate}' of '${title}': ${e.message}. Using null.`); // Translated
                            formattedDate = null;
                        }
                    } else {
                        console.warn(`[Scraper] Unexpected date format in href for '${title}': '${dateLinkHref}'. Using null.`); // Translated
                    }
                } else {
                    console.warn(`[Scraper] Day link (td.td-day a) not found for '${title}'.`); // Translated
                }

                if (!viewingId || !formattedDate) { 
                    console.warn(`[Scraper] Skipping entry '${title}' due to invalid/missing Viewing ID or date.`); // Translated
                    return true; 
                }

                if (slug) {
                    allDiaryEntries.push({ slug, title, year: year || null, rating, date: formattedDate, viewing_id: viewingId });
                }
            });
            
            page++; 
        } catch (error) {
            if (error.response && error.response.status === 404) {
                console.log(`[Scraper] Finished on page ${page}. Found ${allDiaryEntries.length} entries in total for ${username}.`); // Translated
                break;
            }
            console.error(`[Scraper] Fatal error during diary fetch on page ${page} for ${username}:`, error.message); // Translated
            console.error(error); 
            break; 
        }
    }

    return allDiaryEntries;
}
