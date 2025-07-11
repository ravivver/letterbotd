// scraper/getFilmDetailsFromSlug.js

import axios from 'axios';
import * as cheerio from 'cheerio';

/**
 * Scrapes film details from its Letterboxd page using the slug.
 * @param {string} filmSlug The film slug (e.g., "scarface-1983").
 * @returns {Promise<Object>} Object with title, year, posterUrlLetterboxd.
 * Returns null if the film is not found or if essential data cannot be extracted.
 */
async function getFilmDetailsFromSlug(filmSlug) {
    if (!filmSlug) {
        console.error("[Scraper - FilmDetails] Error: Film slug is required."); // Translated
        return null;
    }

    const url = `https://letterboxd.com/film/${filmSlug}/`;
    console.log(`[Scraper - FilmDetails] Fetching details for slug: ${filmSlug} at URL: ${url}`); // Translated

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

        // --- Film Page Error Checks ---
        const pageTitleMeta = $('meta[property="og:title"]').attr('content');
        if (pageTitleMeta && (pageTitleMeta.includes('Page Not Found') || pageTitleMeta.includes('404'))) {
            console.log(`[Scraper - FilmDetails] Film with slug "${filmSlug}" not found (via og:title or 404).`); // Translated
            return null;
        }
        if (response.status === 404) {
            console.log(`[Scraper - FilmDetails] Film with slug "${filmSlug}" not found (status 404).`); // Translated
            return null;
        }
        // --- End of Error Checks ---

        let title = null;
        let year = null;

        // --- TITLE: Using the provided selector ---
        title = $('h1 .name.prettify').text().trim();
        if (!title) {
            const ogTitle = $('meta[property="og:title"]').attr('content');
            if (ogTitle) {
                const match = ogTitle.match(/^(.*)\s\((\d{4})\)$/);
                if (match) {
                    title = match[1].trim();
                } else {
                    title = ogTitle.trim();
                }
            }
        }
        
        // --- YEAR: Using the provided selector ---
        const yearElement = $('span.releasedate a');
        if (yearElement.length) {
            const yearText = yearElement.text().trim();
            const parsedYear = parseInt(yearText);
            if (!isNaN(parsedYear)) {
                year = parsedYear;
            } else {
                console.log(`[Scraper - FilmDetails] Invalid year found for "${filmSlug}": ${yearText}`); // Translated
            }
        } else {
            console.log(`[Scraper - FilmDetails] Year element (span.releasedate a) NOT found for "${filmSlug}".`); // Translated
        }

        // Fallback for year from og:title (if og:title had the year and we didn't get it before)
        if (year === null) {
             const ogTitle = $('meta[property="og:title"]').attr('content');
            if (ogTitle) {
                const match = ogTitle.match(/\((\d{4})\)$/); 
                if (match) {
                    const parsedYear = parseInt(match[1]);
                    if (!isNaN(parsedYear)) {
                        year = parsedYear;
                        console.log(`[Scraper - FilmDetails] Year ${year} extracted from og:title (fallback).`); // Translated
                    }
                }
            }
        }

        // Poster URL (from background-image of the main div or img tag)
        let posterUrlLetterboxd = null;
        const posterDiv = $('.film-poster.poster'); 
        if (posterDiv.length) {
            const style = posterDiv.attr('style'); 
            if (style && style.includes('background-image')) {
                const urlMatch = style.match(/url\("(.+)"\)/);
                if (urlMatch && urlMatch[1]) {
                    posterUrlLetterboxd = urlMatch[1];
                }
            }
        }
        // Fallback: img tag inside film-poster (if not background-image)
        if (!posterUrlLetterboxd) {
            const imgElement = $('.film-poster img.image');
            if (imgElement.length) {
                posterUrlLetterboxd = imgElement.attr('src');
            }
        }

        if (!title || year === null) { 
             console.log(`[Scraper - FilmDetails] Failed to extract essential title or year for "${filmSlug}". Title: "${title}", Year: ${year}`); // Translated
             return null;
        }

        console.log(`[Scraper - FilmDetails] Details for "${filmSlug}": Title: "${title}", Year: ${year}, LB Poster: ${posterUrlLetterboxd ? 'Found' : 'Not found'}`); // Translated

        return {
            title,
            year,
            posterUrlLetterboxd, 
            slug: filmSlug 
        };

    } catch (error) {
        console.error(`Unexpected error fetching film details for "${filmSlug}":`, error.message); // Translated
        return null; 
    }
}

export default getFilmDetailsFromSlug;
