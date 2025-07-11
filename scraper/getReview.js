// scraper/getReview.js

import axios from 'axios';
import * as cheerio from 'cheerio';

/**
 * Scrapes all review pages for a Letterboxd user.
 * @param {string} username The Letterboxd username.
 * @returns {Promise<Array<Object>>} An array of objects, each with review details.
 * Returns an empty array if no reviews are found, the profile is private, or the user does not exist.
 */
async function getRecentReviews(username) {
    if (!username) {
        throw new Error('Letterboxd username is required.'); // Translated
    }

    let allReviews = [];
    let currentPage = 1;
    let hasNextPage = true; // Assume there's a first page to start

    try {
        // --- MAIN LOOP TO FETCH ALL PAGES ---
        while (hasNextPage) {
            const url = `https://letterboxd.com/${username}/films/reviews/page/${currentPage}/`;
            console.log(`[Scraper - Reviews] Fetching reviews from page ${currentPage} for ${username}...`); // Translated

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
                if (currentPage === 1) {
                    throw new Error('Letterboxd user not found.'); // Translated
                } else {
                    hasNextPage = false;
                    break;
                }
            }

            if (pageTitle.includes('Profile is Private') || mainContent.includes('This profile is private')) {
                throw new Error('Letterboxd profile is private. Cannot access reviews.'); // Translated
            }

            if (response.status === 404 && currentPage === 1) {
                throw new Error('The Letterboxd page returned an unexpected 404 error on the first attempt.'); // Translated
            }
            // --- End of Page Error Checks ---

            const reviewElements = $('.listitem.js-listitem article.production-viewing');

            if (!reviewElements.length && currentPage === 1) {
                return [];
            } else if (!reviewElements.length && currentPage > 1) {
                hasNextPage = false;
                break;
            }

            reviewElements.each((i, element) => {
                const entry = $(element);

                const filmTitle = entry.find('h2.name.prettify a').text().trim();
                const filmYearText = entry.find('.releasedate a').text().trim();
                const filmYear = filmYearText ? parseInt(filmYearText) : null;

                const filmLinkHref = entry.find('h2.name.prettify a').attr('href');
                const filmSlugMatch = filmLinkHref?.match(/\/film\/([a-zA-Z0-9-]+)\//);
                const filmSlug = filmSlugMatch ? filmSlugMatch[1] : null;

                const reviewBodyTextContainer = entry.find('.js-review .body-text.js-collapsible-text');
                let reviewText = reviewBodyTextContainer.find('p').text().trim();

                let reviewUrl = `https://letterboxd.com${filmLinkHref}`;
                const dataFullTextUrl = reviewBodyTextContainer.attr('data-full-text-url');
                if (dataFullTextUrl) {
                    const viewingIdMatch = dataFullTextUrl.match(/:(\d+)\//);
                    const viewingId = viewingIdMatch ? viewingIdMatch[1] : null;
                    if (viewingId && username && filmSlug) {
                        reviewUrl = `https://letterboxd.com/${username}/film/${filmSlug}/${viewingId}/`;
                    }
                }
                if (reviewBodyTextContainer.find('.js-collapsible-text-toggle').length > 0 && !reviewText.endsWith('...')) {
                    reviewText += '...';
                }

                const reviewDateElement = entry.find('time.timestamp');
                const reviewDate = reviewDateElement.attr('datetime') || reviewDateElement.text().trim();

                let rating = null;
                const ratingSpan = entry.find('span.rating');
                if (ratingSpan.length) {
                    const ratedClass = ratingSpan.attr('class')?.match(/rated-(\d+)/);
                    if (ratedClass && ratedClass[1]) {
                        rating = parseInt(ratedClass[1]) / 2;
                    }
                }

                allReviews.push({
                    username: username,
                    filmTitle: filmTitle,
                    filmYear: filmYear,
                    filmSlug: filmSlug,
                    reviewUrl: reviewUrl,
                    reviewText: reviewText,
                    reviewDate: reviewDate,
                    rating: rating
                });
            });

            // --- PAGINATION LOGIC BASED ON "Newer" and "Older" buttons ---
            const nextButton = $('.pagination .next'); 
            const prevButton = $('.pagination .previous'); 

            if (nextButton.length > 0) {
                currentPage++;
                hasNextPage = true;
            } else if (prevButton.length > 0 && nextButton.length === 0) {
                hasNextPage = false;
            } else {
                hasNextPage = false;
            }

            // *** DELAY TO AVOID OVERLOADING LETTERBOXD SERVER ***
            if (hasNextPage) { 
                await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
            }
        }

        return allReviews;

    } catch (error) {
        if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED' || error.code === 'UND_ERR_SOCKET') {
            throw new Error('Could not connect to Letterboxd. Check your internet connection.'); // Translated
        }
        if (error.message.includes('Profile is Private') || error.message.includes('User not found')) { // Translated
            throw error;
        }
        console.error(`Unexpected error scraping user reviews for ${username}:`, error.message); // Translated
        throw new Error(`An unexpected error occurred while fetching ${username}'s reviews. Please try again later. Details: ${error.message}`); // Translated
    }
}

export default getRecentReviews;
