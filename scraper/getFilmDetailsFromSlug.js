import axios from 'axios';
import * as cheerio from 'cheerio';

async function getFilmDetailsFromSlug(filmSlug) {
    if (!filmSlug) {
        console.error("[Scraper - FilmDetails] Error: Film slug is required.");
        return null;
    }

    const url = `https://letterboxd.com/film/${filmSlug}/`;
    console.log(`[Scraper - FilmDetails] Fetching details for slug: ${filmSlug} at URL: ${url}`);

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

        const pageTitleMeta = $('meta[property="og:title"]').attr('content');
        if (pageTitleMeta && (pageTitleMeta.includes('Page Not Found') || pageTitleMeta.includes('404'))) {
            console.log(`[Scraper - FilmDetails] Film with slug "${filmSlug}" not found (via og:title or 404).`);
            return null;
        }
        if (response.status === 404) {
            console.log(`[Scraper - FilmDetails] Film with slug "${filmSlug}" not found (status 404).`);
            return null;
        }

        let title = null;
        let year = null;

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
        
        const yearElement = $('span.releasedate a');
        if (yearElement.length) {
            const yearText = yearElement.text().trim();
            const parsedYear = parseInt(yearText);
            if (!isNaN(parsedYear)) {
                year = parsedYear;
            } else {
                console.log(`[Scraper - FilmDetails] Invalid year found for "${filmSlug}": ${yearText}`);
            }
        } else {
            console.log(`[Scraper - FilmDetails] Year element (span.releasedate a) NOT found for "${filmSlug}".`);
        }

        if (year === null) {
             const ogTitle = $('meta[property="og:title"]').attr('content');
            if (ogTitle) {
                const match = ogTitle.match(/\((\d{4})\)$/); 
                if (match) {
                    const parsedYear = parseInt(match[1]);
                    if (!isNaN(parsedYear)) {
                        year = parsedYear;
                        console.log(`[Scraper - FilmDetails] Year ${year} extracted from og:title (fallback).`);
                    }
                }
            }
        }

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
        if (!posterUrlLetterboxd) {
            const imgElement = $('.film-poster img.image');
            if (imgElement.length) {
                posterUrlLetterboxd = imgElement.attr('src');
            }
        }

        if (!title || year === null) { 
             console.log(`[Scraper - FilmDetails] Failed to extract essential title or year for "${filmSlug}". Title: "${title}", Year: ${year}`);
             return null;
        }

        console.log(`[Scraper - FilmDetails] Details for "${filmSlug}": Title: "${title}", Year: ${year}, LB Poster: ${posterUrlLetterboxd ? 'Found' : 'Not found'}`);

        return {
            title,
            year,
            posterUrlLetterboxd, 
            slug: filmSlug 
        };

    } catch (error) {
        console.error(`Unexpected error fetching film details for "${filmSlug}":`, error.message);
        return null; 
    }
}

export default getFilmDetailsFromSlug;