// utils/formatEmbed.js

import { EmbedBuilder, AttachmentBuilder } from 'discord.js';
import { getTmdbPosterUrl } from '../api/tmdb.js';
import sharp from 'sharp';
import axios from 'axios';

// --- AUXILIARY FUNCTIONS ---

function formatDateEn(dateString) { // Renamed to formatDateEn for English
    if (!dateString) return 'N/A';
    let date;
    try {
        date = new Date(dateString);
        if (isNaN(date.getTime())) {
            const parts = dateString.match(/(\d{2}) (\w{3}) (\d{4})/);
            if (parts) {
                const [_, day, monthAbbr, year] = parts;
                const monthNames = {
                    'Jan': 0, 'Feb': 1, 'Mar': 2, 'Apr': 3, 'May': 4, 'Jun': 5,
                    'Jul': 6, 'Aug': 7, 'Sep': 8, 'Oct': 9, 'Nov': 10, 'Dec': 11
                };
                const monthIndex = monthNames[monthAbbr] !== undefined ? monthNames[monthAbbr] : new Date(Date.parse(monthAbbr +" 1, 2000")).getMonth();
                date = new Date(year, monthIndex, day);
            } else {
                return 'N/A';
            }
        }
    } catch (e) {
        return 'N/A';
    }

    const day = String(date.getDate()).padStart(2, '0');
    const month = date.toLocaleString('en-US', { month: 'short' }); // Changed to en-US
    const yearShort = String(date.getFullYear()).slice(-2);

    return `${day} ${month.charAt(0).toUpperCase() + month.slice(1)} ${yearShort}`;
}

function convertRatingToStars(rating) {
    if (rating === null || isNaN(rating)) return 'Not Rated'; // Translated

    let stars = '';
    const fullStars = Math.floor(rating);
    const halfStar = rating % 1 !== 0;

    for (let i = 0; i < fullStars; i++) {
        stars += '⭐';
    }

    if (halfStar) {
        stars += '½';
    }
    
    return stars;
}


// --- EMBED CREATION FUNCTIONS ---

async function createDiaryEmbed(latestFilm, tmdbDetails, letterboxdUsername) {
    const embed = new EmbedBuilder()
        .setColor(0xFFFF00) // Yellow
        .setURL(latestFilm.url);

    const embedTitle = `Last Film by ${letterboxdUsername} 🎬`; // Translated
    embed.setTitle(embedTitle);

    let description = `**Film:** ${latestFilm.title} (${latestFilm.year})\n`; // Translated
    description += `**Watched:** ${formatDateEn(latestFilm.watchedDateFull || latestFilm.watchedDate)}\n`; // Using formatDateEn
    description += `**Rating:** ${convertRatingToStars(latestFilm.rating)}\n`; // Translated

    embed.setDescription(description);

    if (tmdbDetails) {
        embed.setImage(getTmdbPosterUrl(tmdbDetails.poster_path, 'w500'));

        const roundedRating = tmdbDetails.vote_average ? parseFloat(tmdbDetails.vote_average).toFixed(1) : 'N/A';
        const votesFormatted = tmdbDetails.vote_count ? `${tmdbDetails.vote_count.toLocaleString('en-US')} Votes` : 'N/A'; // Translated

        embed.addFields(
            {
                name: 'Rating (TMDB)',
                value: `${roundedRating} (${votesFormatted})`,
                inline: true
            },
            {
                name: 'Genres (TMDB)', // Translated
                value: tmdbDetails.genres?.join(', ') || 'N/A',
                inline: true
            },
            {
                name: 'Synopsis (TMDB)', // Translated
                value: tmdbDetails.overview ? tmdbDetails.overview.substring(0, 500) + '...' : (tmdbDetails.overview_en ? tmdbDetails.overview_en.substring(0, 500) + '...' : 'N/A'),
                inline: false
            }
        );
    }

    embed.setFooter(null);

    return embed;
}

async function createReviewEmbed(reviewDetails, tmdbDetails, letterboxdUsername) {
    const embed = new EmbedBuilder()
        .setColor(0xAA00AA) // Purple color for reviews
        .setURL(reviewDetails.reviewUrl);

    const embedTitle = `Latest Review by ${letterboxdUsername} 📝`; // Translated
    embed.setTitle(embedTitle);

    let description = `**Film:** ${reviewDetails.filmTitle} (${reviewDetails.filmYear})\n`; // Translated

    if (tmdbDetails && tmdbDetails.genres && tmdbDetails.genres.length > 0) {
        description += `**Genres:** ${tmdbDetails.genres.join(', ')}\n`; // Translated
    } else {
        description += `**Genres:** N/A\n`; // Translated
    }

    description += `**Written:** ${formatDateEn(reviewDetails.reviewDate)}\n`; // Translated, using formatDateEn
    description += `**Rating:** ${convertRatingToStars(reviewDetails.rating)}\n\n`; // Translated

    if (reviewDetails.reviewText.length > 700) {
        description += `${reviewDetails.reviewText.substring(0, 700)}...\n`;
        description += `[Read full review here](${reviewDetails.reviewUrl})\n`; // Translated
    } else {
        description += `${reviewDetails.reviewText}\n`;
    }

    embed.setDescription(description);

    if (tmdbDetails) {
        embed.setThumbnail(getTmdbPosterUrl(tmdbDetails.poster_path, 'w92'));
    }

    embed.setFooter(null);

    return embed;
}

async function createDailyDiaryEmbed(filmsDoDia, letterboxdUsername, displayDate) {
    const embed = new EmbedBuilder()
        .setColor(0x00FF00) // A green color for the daily diary, to differentiate
        .setTitle(`Diary of ${letterboxdUsername} on ${displayDate} 🗓️`); // Translated

    let description = '';
    if (filmsDoDia.length > 0) {
        for (const filmData of filmsDoDia) {
            description += `**- ${filmData.title}** (${filmData.year})\n`;
            description += `  Rating: ${convertRatingToStars(filmData.rating)}\n`; // Translated
            if (filmData.tmdbDetails) {
                description += `  Genres (TMDB): ${filmData.tmdbDetails.genres?.join(', ') || 'N/A'}\n`; // Translated
            }
            description += `  [View on Letterboxd](${filmData.url})\n\n`; // Translated
        }
    } else {
        description = `No films watched on this date.`; // Translated
    }
    embed.setDescription(description.substring(0, 4096));

    if (filmsDoDia[0]?.tmdbDetails?.poster_path) {
        embed.setThumbnail(getTmdbPosterUrl(filmsDoDia[0].tmdbDetails.poster_path, 'w92'));
    }

    embed.setFooter(null);

    return embed;
}

async function createFavoritesEmbed(favoriteFilms, letterboxdUsername) {
    const embed = new EmbedBuilder()
        .setColor(0xFF00FF) // A vibrant color for favorites (e.g., magenta)
        .setTitle(`Favorite Films of ${letterboxdUsername} ❤️`); // Translated

    let attachment = null;
    let imageFailureMessage = '';

    const filmListDescription = favoriteFilms.map((film, index) =>
        `${index + 1}. **[${film.title} (${film.year})](https://letterboxd.com/film/${film.slug}/)**`
    ).join('\n');
    embed.setDescription(filmListDescription);

    const posterUrls = favoriteFilms.map(film =>
        film.tmdbDetails?.poster_path ? getTmdbPosterUrl(film.tmdbDetails.poster_path, 'w342') : null
    ).filter(url => url !== null);

    if (posterUrls.length > 0) {
        const posterBuffers = await Promise.all(
            posterUrls.map(async url => {
                try {
                    const response = await axios.get(url, { responseType: 'arraybuffer' });
                    return response.data;
                } catch (error) {
                    console.error(`Error downloading poster from ${url}:`, error.message); // Translated
                    return sharp({ create: { width: 342, height: 513, channels: 4, background: { r: 100, g: 100, b: 100, alpha: 1 } } }).png().toBuffer();
                }
            })
        );

        const posterWidth = 342;
        const posterHeight = 513;
        const gap = 10;
        const numCols = Math.min(posterUrls.length, 2);
        const numRows = Math.ceil(posterUrls.length / 2);
        const outputWidth = numCols * posterWidth + (numCols - 1) * gap;
        const outputHeight = numRows * posterHeight + (numRows - 1) * gap;

        const compositeImages = posterBuffers.map((buffer, i) => ({
            input: buffer,
            left: (i % 2) * (posterWidth + gap),
            top: Math.floor(i / 2) * (posterHeight + gap)
        }));

        try {
            const combinedImageBuffer = await sharp({ create: { width: outputWidth, height: outputHeight, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
                .composite(compositeImages).png().toBuffer();
            attachment = new AttachmentBuilder(combinedImageBuffer, { name: 'favorites_grid.png' });
        } catch (sharpError) {
            console.error('Error composing image with sharp:', sharpError.message); // Translated
            imageFailureMessage = 'An error occurred while generating the poster grid image.'; // Translated
            attachment = null;
        }
    } else {
        imageFailureMessage = 'Could not retrieve favorite film posters.'; // Translated
    }

    if (imageFailureMessage) {
        embed.setDescription((embed.description || '') + `\n\n${imageFailureMessage}`);
    }

    return { embed, attachment };
}

// --- FINAL VERSION OF createGridImage FUNCTION (NOW GENERIC FOR GRIDS) ---
/**
 * Creates an embed and a grid image for films.
 * Supports hyperlinks and incomplete grids with transparent backgrounds.
 * This function will be used for "Likes" and "Watched Films".
 * @param {Array<Object>} films Array of film objects with slug, title, year, posterUrl.
 * @param {string} gridTitle The title of the grid (e.g., "Liked Films of X", "Watched Films Today by Y").
 * @param {number} cols Number of columns.
 * @param {number} rows Number of rows.
 * @returns {Promise<Object>} An object containing the EmbedBuilder and the AttachmentBuilder (the image).
 */
async function createGridImage(films, gridTitle, cols, rows) {
    const embed = new EmbedBuilder()
        .setColor(0x6f52e3) // Purple color
        .setTitle(`Grid of ${gridTitle}`); // Dynamic title

    let attachment = null;
    const requiredFilms = cols * rows;

    // HYPERLINK LOGIC
    // Ensures title and year are not undefined in the text
    const filmListDescription = films
        .map((film, index) => `${index + 1}. **[${film.title || 'Unknown Film'} (${film.year || '????'})](https://letterboxd.com/film/${film.slug}/)**`) // Translated
        .join('\n');
    embed.setDescription(filmListDescription);

    // Downloads posters. If it fails or is null, the result will be null.
    // Fills the list with 'null' for the spaces that will be empty
    const posterPromises = [];
    for (let i = 0; i < requiredFilms; i++) {
        const film = films[i]; 
        if (film && film.posterUrl) {
            posterPromises.push(axios.get(film.posterUrl, { responseType: 'arraybuffer' })
                .then(response => response.data)
                .catch(error => {
                    console.error(`Error downloading poster for ${film.title} (${film.posterUrl}):`, error.message); // Translated
                    return null; 
                })
            );
        } else {
            posterPromises.push(Promise.resolve(null)); // For intentional empty spaces
        }
    }
    const posterBuffers = await Promise.all(posterPromises);

    const posterWidth = 150;
    const posterHeight = 225;
    const gap = 10;
    const outputWidth = cols * posterWidth + (cols - 1) * gap;
    const outputHeight = rows * posterHeight + (rows - 1) * gap;

    const compositeImages = [];
    for (let i = 0; i < requiredFilms; i++) {
        const buffer = posterBuffers[i];
        if (buffer) {
            compositeImages.push({
                input: await sharp(buffer).resize(posterWidth, posterHeight).toBuffer(),
                left: Math.floor(i % cols) * (posterWidth + gap),
                top: Math.floor(i / cols) * (posterHeight + gap)
            });
        }
    }
    
    try {
        const combinedImageBuffer = await sharp({
            create: {
                width: outputWidth,
                height: outputHeight,
                channels: 4,
                background: { r: 0, g: 0, b: 0, alpha: 0 } 
            }
        })
        .composite(compositeImages)
        .png()
        .toBuffer();
        attachment = new AttachmentBuilder(combinedImageBuffer, { name: `grid_${cols}x${rows}.png` });
    } catch (sharpError) {
        console.error('Error composing grid image with sharp:', sharpError.message); // Translated
        embed.setFooter({ text: 'An error occurred while generating the grid image.' }); // Translated
    }

    return { embed, attachment };
}


async function createProfileEmbed(profileStats, username) {
    const embed = new EmbedBuilder()
        .setColor(0xFFFFFF) // White color
        .setTitle(`Letterboxd Profile of ${username}`) // Translated
        .setURL(profileStats.profileUrl) 
        .setThumbnail(profileStats.userAvatarUrl || null); 

    embed.setFooter(null);

    const fields = [];

    if (profileStats.totalFilmsWatched !== 'N/A') {
        fields.push({
            name: '🎬 Films Watched:', // Translated
            value: profileStats.totalFilmsWatched,
            inline: true
        });
    }
    if (profileStats.filmsThisYear !== 'N/A') {
        fields.push({
            name: '📅 Films This Year:', // Translated
            value: profileStats.filmsThisYear,
            inline: true
        });
    }
    if (profileStats.totalFilmsWatched !== 'N/A' || profileStats.filmsThisYear !== 'N/A') {
        fields.push({ name: '\u200b', value: '\u200b', inline: false }); 
    }

    if (profileStats.following !== 'N/A') {
        fields.push({
            name: '🤝 Following:', // Translated
            value: profileStats.following,
            inline: true
        });
    }
    if (profileStats.followers !== 'N/A') {
        fields.push({
            name: '👥 Followers:', // Translated
            value: profileStats.followers,
            inline: true
        });
    }
    if (profileStats.following !== 'N/A' || profileStats.followers !== 'N/A') {
        fields.push({ name: '\u200b', value: '\u200b', inline: false });
    }

    if (profileStats.watchlistCount !== 'N/A') {
        fields.push({
            name: '👀 Watchlist:', // Translated
            value: profileStats.watchlistCount,
            inline: true
        });
    }
    if (profileStats.tagsList && profileStats.tagsList.length > 0) {
        fields.push({
            name: '🏷️ Tags Used:', // Translated
            value: profileStats.tagsList.join(', '),
            inline: true
        });
    } else if (profileStats.tagsList && profileStats.tagsList.length === 0) {
        fields.push({
            name: '🏷️ Tags Used:', // Translated
            value: 'None', // Translated
            inline: true
        });
    }

    if (fields.length > 0) {
        embed.addFields(fields);
    } else {
        embed.setDescription('Could not retrieve profile statistics.'); // Translated
    }

    return { embed };
}

// --- FINAL EXPORT BLOCK OF ALL FUNCTIONS ---
// All functions declared above are exported here.
export {
    createDiaryEmbed,
    createReviewEmbed,
    createDailyDiaryEmbed,
    createFavoritesEmbed,
    createGridImage, 
    createProfileEmbed,
    formatDateEn, // Exporting formatDateEn
    convertRatingToStars
};
