import axios from 'axios';
import * as cheerio from 'cheerio';

async function getFilmDetails(filmSlug) {
    if (!filmSlug) {
        throw new Error('Film slug is required.');
    }

    const url = `https://letterboxd.com/film/${filmSlug}/`;

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

        const pageTitle = $('title').text();
        const mainContent = $('#content').text();
        if (pageTitle.includes('Page Not Found') || mainContent.includes('The page you were looking for doesn\'t exist')) {
            throw new Error(`Film '${filmSlug}' not found.`);
        }
        if (response.status === 404) {
             throw new Error(`The film page '${filmSlug}' returned an unexpected 404 error.`);
        }


        let highResPosterUrl = null;
        const modalImgSrc = $('#poster-modal .modal-body .poster img.image').attr('src');
        const modalImgSrcset = $('#poster-modal .modal-body .poster img.image').attr('srcset');

        if (modalImgSrcset) { 
            const urls = modalImgSrcset.split(',').map(s => s.trim().split(' ')[0]);
            if (urls.length > 0) highResPosterUrl = urls[urls.length - 1]; 
        }
        if (!highResPosterUrl && modalImgSrc) { 
            highResPosterUrl = modalImgSrc;
        }

        if (!highResPosterUrl) {
            const posterModalLinkHref = $('a[data-js-trigger="postermodal"]').attr('href');
            if (posterModalLinkHref) {
                highResPosterUrl = `https://letterboxd.com${posterModalLinkHref.replace(/\/image-\d+\/$/, '/')}`;
            }
        }

        let backdropUrl = null;
        const backdropDiv = $('#backdrop');
        if (backdropDiv.length) {
            backdropUrl = backdropDiv.attr('data-backdrop');
        }

        let filmLikesCount = null;
        const likesTooltipElement = $('.production-statistic.-likes a.tooltip'); 
        if (likesTooltipElement.length) {
            const originalTitle = likesTooltipElement.attr('data-original-title');
            if (originalTitle) {
                const match = originalTitle.match(/Liked by ([\d,]+)/);
                if (match && match[1]) {
                    filmLikesCount = match[1].replace(/,/g, ''); 
                }
            }
        }

        let filmWatchesCount = null;
        const watchesTooltipElement = $('.production-statistic.-watches a.tooltip');
        if (watchesTooltipElement.length) {
            const originalTitle = watchesTooltipElement.attr('data-original-title');
            if (originalTitle) {
                const match = originalTitle.match(/Watched by ([\d,]+)/);
                if (match && match[1]) {
                    filmWatchesCount = match[1].replace(/,/g, ''); 
                }
            }
        }

        let director = null;
        const directorElement = $('p.credits span.creatorlist a span.prettify');
        if (directorElement.length) {
            director = directorElement.text().trim();
        }

        let averageRating = null;
        let ratingsCount = null;
        const averageRatingElement = $('span.average-rating a.display-rating');
        if (averageRatingElement.length) {
            averageRating = averageRatingElement.text().trim();
            const originalTitle = averageRatingElement.attr('data-original-title');
            if (originalTitle) {
                const match = originalTitle.match(/based on ([\d,]+)(?:&nbsp;|\s+)ratings/); 
                if (match && match[1]) {
                    ratingsCount = match[1].replace(/,/g, '');
                }
            }
        }

        return {
            filmSlug: filmSlug,
            highResPoster: highResPosterUrl,
            backdrop: backdropUrl,
            likesCount: filmLikesCount,
            watchesCount: filmWatchesCount,
            director: director,
            averageRating: averageRating,
            ratingsCount: ratingsCount
        };

    } catch (error) {
        if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED' || error.code === 'UND_ERR_SOCKET') {
            throw new Error('Could not connect to Letterboxd to fetch film details. Check your internet connection.');
        }
        if (error.message.includes('Film') || error.message.includes('404')) {
            throw error;
        }
        console.error(`Unexpected error scraping film details for '${filmSlug}':`, error.message);
        throw new Error(`An unexpected error occurred while fetching details for film '${filmSlug}'. Please try again later.`);
    }
}

export default getFilmDetails;