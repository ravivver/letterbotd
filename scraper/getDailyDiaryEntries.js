// scraper/getDailyDiaryEntries.js
import axios from 'axios';
import * as cheerio from 'cheerio';

/**
 * Fetches diary entries for a specific day for a Letterboxd user.
 * @param {string} username The Letterboxd username.
 * @param {Date} date The Date object for the day to be checked.
 * @returns {Array<Object>} An array of diary entry objects for the day.
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

    console.log(`[Scraper] Fetching diary for ${username} on ${formattedDate}...`); // Translated

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
            console.log(`[Scraper] No entries found for ${username} on ${formattedDate}.`); // Translated
            return [];
        }
        console.error(`[Scraper] Error fetching diary for ${username} on ${formattedDate}:`, error.message); // Translated
        return [];
    }
}
