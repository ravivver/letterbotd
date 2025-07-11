// scraper/checkFilmInDiary.js (Final Version with Link Date - Translated to English)
import axios from 'axios';
import * as cheerio from 'cheerio';

/**
 * Checks if a specific film has been watched by a user by scraping their diary.
 * @param {string} username The Letterboxd username.
 * @param {string} filmSlug The slug of the film to check.
 * @returns {Promise<Object>} An object indicating if the film was watched, its rating, and date.
 */
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
                    
                    // --- CORRECTED DATE LOGIC ---
                    // Priority 1: data-viewing-date attribute (more reliable)
                    let dateStr = row.attr('data-viewing-date');
                    
                    // Priority 2: Extract from the day link's href (your finding!)
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
                            rating = (parseInt(ratingMatch[1], 10) / 2); // Keep as number for easier handling
                        }
                    }

                    foundFilm = { watched: true, rating: rating, date: dateStr };
                    return false; // Stop iterating
                }
            });

            if (foundFilm) return foundFilm;
            page++; // Move to the next page

        } catch (error) {
            if (error.response && error.response.status === 404) return { watched: false };
            console.error(`Error checking diary on page ${page} for ${username}:`, error.message); // Translated
            return { watched: false, error: true };
        }
    }
}
