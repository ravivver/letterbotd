import axios from 'axios';
import * as cheerio from 'cheerio';

async function getProfileStats(username) {
    if (!username) {
        throw new Error('Letterboxd username is required.');
    }

    const url = `https://letterboxd.com/${username}/`;
    console.log(`[Scraper - Profile] Fetching profile statistics for ${username} at URL: ${url}`);

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

        if (mainContent.includes('Sorry, we can’t find the page you’ve requested.')) {
            throw new Error('Letterboxd user not found.');
        }

        if (pageTitle.includes('Profile is Private') || mainContent.includes('This profile is private')) {
            throw new Error('Letterboxd profile is private. Cannot access statistics.');
        }

        if (response.status === 404) {
            throw new Error('The Letterboxd page returned an unexpected 404 error.');
        }

        const stats = {
            totalFilmsWatched: 'N/A',
            filmsThisYear: 'N/A',
            following: 'N/A',
            followers: 'N/A',
            watchlistCount: 'N/A',
            tagsList: [], 
            userAvatarUrl: null,
            profileUrl: url
        };

        const avatarImg = $('div.profile-avatar span.avatar img');
        if (avatarImg.length) {
            stats.userAvatarUrl = avatarImg.attr('src');
        } else {
            console.log("[Scraper - Profile] Warning: Avatar not found with current selector.");
        }

        const profileStatsDiv = $('div.profile-stats.js-profile-stats');
        if (profileStatsDiv.length) {
            const filmsWatchedElement = profileStatsDiv.find('h4.profile-statistic a[href$="/films/"] .value');
            if (filmsWatchedElement.length) stats.totalFilmsWatched = filmsWatchedElement.text().trim();

            const filmsThisYearElement = profileStatsDiv.find('h4.profile-statistic a[href*="/films/diary/for/"] .value');
            if (filmsThisYearElement.length) stats.filmsThisYear = filmsThisYearElement.text().trim();

            const followingElement = profileStatsDiv.find('h4.profile-statistic a[href$="/following/"] .value');
            if (followingElement.length) stats.following = followingElement.text().trim();

            const followersElement = profileStatsDiv.find('h4.profile-statistic a[href$="/followers/"] .value');
            if (followersElement.length) stats.followers = followersElement.text().trim();

        } else {
            console.log("[Scraper - Profile] Warning: Profile statistics div (profile-stats) not found.");
        }

        const watchlistSection = $('section.watchlist-aside');
        if (watchlistSection.length) {
            const watchlistCountElement = watchlistSection.find('a.all-link');
            if (watchlistCountElement.length) stats.watchlistCount = watchlistCountElement.text().trim();
        } else {
            console.log("[Scraper - Profile] Warning: Watchlist section not found.");
        }

        const tagsSection = $('section:has(h3.section-heading a[href$="/tags/"])');
        if (tagsSection.length) {
            const tagElements = tagsSection.find('ul.tags li a');
            if (tagElements.length) {
                tagElements.each((i, el) => {
                    stats.tagsList.push($(el).text().trim());
                });
            } else {
                console.log("[Scraper - Profile] Warning: No tags found within the tags section.");
            }
        } else {
            console.log("[Scraper - Profile] Warning: Tags section not found.");
        }

        console.log(`[Scraper - Profile] Statistics for ${username}:`, stats);

        return stats;

    } catch (error) {
        if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED' || error.code === 'UND_ERR_SOCKET') {
            throw new Error('Could not connect to Letterboxd. Check your internet connection.');
        }
        if (error.message.includes('Profile is Private') || error.message.includes('User not found')) {
            throw error;
        }
        console.error(`Unexpected error scraping user profile ${username}:`, error.message);
        throw new Error(`An unexpected error occurred while fetching ${username}'s profile. Please try again later. Details: ${error.message}`);
    }
}

export default getProfileStats;