// scraper/getFavorites.js - FINAL VERSION TO GET SLUG AND DATA ATTRIBUTES - Translated to English

import axios from 'axios';
import * as cheerio from 'cheerio';

async function getFavorites(username) {
    if (!username) {
        throw new Error('Letterboxd username is required.'); // Translated
    }

    const url = `https://letterboxd.com/${username}/`;
    const favoriteFilms = [];

    try {
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            },
            validateStatus: function (status) {
                return status >= 200 && status < 300 || status === 404;
            },
        });

        const $ = cheerio.load(response.data);

        // --- Page Error Checks ---
        const pageTitle = $('title').text();
        const mainContent = $('#content').text();

        if (mainContent.includes('Sorry, we can’t find the page you’ve requested.')) {
            throw new Error('Letterboxd user not found.'); // Translated
        }

        if (pageTitle.includes('Profile is Private') || mainContent.includes('This profile is private')) {
            throw new Error('Letterboxd profile is private. Cannot access favorites.'); // Translated
        }

        if (response.status === 404) {
            throw new Error('The Letterboxd page returned an unexpected 404 error.'); // Translated
        }
        // --- End of Page Error Checks ---

        const favoritesSection = $('#favourites');
        if (!favoritesSection.length) {
            console.log('Debug Favorites: #favourites section not found. User may not have favorites.'); // Translated
            return [];
        }

        const favoriteFilmElements = favoritesSection.find('.poster-list li.favourite-film-poster-container');

        if (!favoriteFilmElements.length) {
            console.log('Debug Favorites: No favorite film elements (.poster-list li.favourite-film-poster-container) found. Favorites section might be empty or initial selectors are incorrect.'); // Translated
            return [];
        }

        favoriteFilmElements.slice(0, 4).each((i, element) => {
            const entry = $(element);
            console.log(`Debug Favorites ${i}: Processing entry...`); // Translated

            let filmTitle = 'N/A';
            let filmYear = null;
            let filmSlug = null;
            let filmUrlLetterboxd = 'N/A';

            // --- PRIMARY AND AGGRESSIVE ATTEMPT: Find data-film-slug and data-film-name ---
            // First on the LI itself
            filmSlug = entry.attr('data-film-slug') || null;
            let currentFilmName = entry.attr('data-film-name') || null;

            // If not found on LI, search in any descendant
            if (!filmSlug || !currentFilmName) {
                const descendantWithData = entry.find('[data-film-slug], [data-film-name]').first(); 
                if (descendantWithData.length) {
                    filmSlug = filmSlug || descendantWithData.attr('data-film-slug') || null;
                    currentFilmName = currentFilmName || descendantWithData.attr('data-film-name') || null;
                }
            }

            if (filmSlug) {
                filmUrlLetterboxd = `https://letterboxd.com/film/${filmSlug}/`;
                console.log(`Debug Favorites ${i}: Slug found: ${filmSlug}`); // Translated
            } else {
                console.log(`Debug Favorites ${i}: Slug NOT found after all attempts.`); // Translated
            }

            if (currentFilmName) {
                const match = currentFilmName.match(/^(.*)\s\((\d{4})\)$/);
                if (match) {
                    filmTitle = match[1].trim();
                    filmYear = parseInt(match[2]);
                    console.log(`Debug Favorites ${i}: Title/Year from data-film-name: ${filmTitle} (${filmYear})`); // Translated
                } else {
                    filmTitle = currentFilmName.trim();
                    console.log(`Debug Favorites ${i}: Title from data-film-name (no year): ${filmTitle}`); // Translated
                }
            } else {
                console.log(`Debug Favorites ${i}: data-film-name attribute NOT found.`); // Translated
            }
            // --- END OF DATA ATTRIBUTE EXTRACTION ---


            // --- FALLBACK for TITLE (using image alt, if necessary) ---
            if (filmTitle === 'N/A') { 
                const imgElement = entry.find('.film-poster img.image');
                if (imgElement.length) {
                    const altText = imgElement.attr('alt');
                    if (altText) {
                        filmTitle = altText.trim();
                        console.log(`Debug Favorites ${i}: Title extracted from image alt (fallback): ${filmTitle}`); // Translated
                    }
                }
            }

            // --- Final log to see what was obtained for this entry ---
            console.log(`Debug Favorites ${i}: Final result (slug for next step) -> Provisional Title: "${filmTitle}", Slug: "${filmSlug}", URL: "${filmUrlLetterboxd}"`); // Translated

            favoriteFilms.push({
                title: filmTitle, 
                year: filmYear,   
                slug: filmSlug,   
                url: filmUrlLetterboxd
            });
        });

        if (favoriteFilms.length === 0) {
            console.log(`Debug: No favorite film processed for "${username}". Check selectors or if the user actually has favorites.`); // Translated
        }

        return favoriteFilms;

    } catch (error) {
        if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED' || error.code === 'UND_ERR_SOCKET') {
            throw new Error('Could not connect to Letterboxd. Check your internet connection.'); // Translated
        }
        if (error.message.includes('Profile is Private') || error.message.includes('User not found')) { // Translated
            throw error;
        }
        console.error(`Unexpected error scraping user favorites for ${username}:`, error.message); // Translated
        throw new Error(`An unexpected error occurred while fetching ${username}'s favorite movies. Please try again later. Details: ${error.message}`); // Translated
    }
}

export default getFavorites;
