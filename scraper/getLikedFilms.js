import axios from 'axios';
import * as cheerio from 'cheerio';

async function getLikedFilms(username) {
    if (!username) {
        throw new Error('Letterboxd username is required.');
    }

    let allLikedFilms = [];
    let currentPage = 1;
    let hasNextPage = true;

    try {
        while (hasNextPage) {
            const url = `https://letterboxd.com/${username}/likes/films/page/${currentPage}/`;
            console.log(`[Scraper - Likes] Fetching liked films from page ${currentPage} for ${username}...`);

            const response = await axios.get(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                },
                validateStatus: function (status) {
                    return status >= 200 && status < 300 || status === 404;
                },
            });

            const $ = cheerio.load(response.data);

            const pageTitle = $('title').text();
            const mainContent = $('#content').text();

            if (mainContent.includes('Sorry, we can’t find the page you’ve requested.')) {
                if (currentPage === 1) {
                    throw new Error('Letterboxd user not found.');
                } else {
                    hasNextPage = false;
                    break;
                }
            }

            if (pageTitle.includes('Profile is Private') || mainContent.includes('This profile is private')) {
                throw new Error('Letterboxd profile is private. Cannot access liked films.');
            }

            if (response.status === 404 && currentPage === 1) {
                throw new Error('The Letterboxd page returned an unexpected 404 error on the first attempt.');
            }

            const likedFilmElements = $('ul.poster-list li .poster.film-poster[data-film-slug]');

            if (!likedFilmElements.length && currentPage === 1) {
                console.log(`[Scraper - Likes] No liked films found on page 1 for "${username}" with the current selector.`);
                return [];
            } else if (!likedFilmElements.length && currentPage > 1) {
                hasNextPage = false;
                break;
            }

            likedFilmElements.each((i, element) => {
                const entry = $(element);

                const filmSlug = entry.attr('data-film-slug') || null;
                const filmUrlLetterboxd = filmSlug ? `https://letterboxd.com/film/${filmSlug}/` : 'N/A';

                let filmTitle = 'N/A';
                let filmYear = null;
                const dataFilmName = entry.attr('data-film-name');
                if (dataFilmName) {
                    const match = dataFilmName.match(/^(.*)\s\((\d{4})\)$/);
                    if (match) {
                        filmTitle = match[1].trim();
                        filmYear = parseInt(match[2]);
                    } else {
                        filmTitle = dataFilmName.trim(); 
                    }
                } else {
                    const imgElement = entry.find('img.image');
                    if (imgElement.length) {
                        filmTitle = imgElement.attr('alt') || 'N/A';
                    }
                }

                if (filmSlug) { 
                    allLikedFilms.push({
                        title: filmTitle, 
                        year: filmYear,   
                        slug: filmSlug,   
                        url: filmUrlLetterboxd
                    });
                } else {
                    console.log(`[Scraper - Likes] Warning: Slug not found for a liked film on page ${currentPage}. Entry: ${entry.html().substring(0, 100)}...`);
                }
            });

            currentPage++;
            const nextButton = $('.pagination .next');
            const prevButton = $('.pagination .previous');

            if (nextButton.length > 0) {
                hasNextPage = true;
            } else if (prevButton.length > 0 && nextButton.length === 0) {
                hasNextPage = false;
            } else {
                hasNextPage = false;
            }

            if (hasNextPage) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }

        return allLikedFilms;

    } catch (error) {
        if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED' || error.code === 'UND_ERR_SOCKET') {
            throw new Error('Could not connect to Letterboxd. Check your internet connection.');
        }
        if (error.message.includes('Profile is Private') || error.message.includes('User not found')) {
            throw error;
        }
        console.error(`Unexpected error scraping user liked films for ${username}:`, error.message);
        throw new Error(`An unexpected error occurred while fetching ${username}'s liked films. Please try again later. Details: ${error.message}`);
    }
}

export default getLikedFilms;