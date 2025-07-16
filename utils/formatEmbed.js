// utils/formatEmbed.js

import { EmbedBuilder, AttachmentBuilder } from 'discord.js';
import { getTmdbPosterUrl } from '../api/tmdb.js';
import sharp from 'sharp';
import axios from 'axios';
import QRCode from 'qrcode';
import path from 'node:path';
import { fileURLToPath } from 'node:url'; 

// Resolve __filename and __dirname for ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure these paths are correct and the assets exist
const idCardTemplatePath = path.join(__dirname, '..', 'assets', 'letterid_template.png');
const signatureFontPath = path.join(__dirname, '..', 'assets', 'signature_font.ttf');

// --- AUXILIARY FUNCTIONS ---

/**
 * Formats a date string to "DD Mon YY" (e.g., "05 Jul 25").
 * @param {string} dateString The date string to format.
 * @returns {string} The formatted date or 'N/A'.
 */
function formatDateEn(dateString) {
    if (!dateString) return 'N/A';
    let date;
    try {
        date = new Date(dateString);
        // Handle potential invalid date formats (e.g., '05 Jul 2025' from scraping)
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
    const month = date.toLocaleString('en-US', { month: 'short' });
    const yearShort = String(date.getFullYear()).slice(-2);

    return `${day} ${month.charAt(0).toUpperCase() + month.slice(1)} ${yearShort}`;
}

/**
 * Converts a numeric rating to a star emoji representation.
 * @param {number|null|undefined} rating The numeric rating (e.g., 3.5, 4).
 * @returns {string} Star emojis (e.g., "⭐⭐⭐½") or "Not Rated".
 */
function convertRatingToStars(rating) {
    if (rating === null || isNaN(rating)) return 'Not Rated';

    let stars = '';
    const fullStars = Math.floor(rating);
    const halfStar = rating % 1 !== 0;

    for (let i = 0; i < fullStars; i++) {
        stars += '⭐'; // Full star emoji
    }

    if (halfStar) {
        stars += '½'; // Half star emoji
    }
    
    return stars;
}


// --- EMBED CREATION FUNCTIONS ---

/**
 * Creates an embed for the latest film watched by a user.
 * @param {Object} latestFilm Latest film details from Letterboxd.
 * @param {Object|null} tmdbDetails TMDB details for the film.
 * @param {string} letterboxdUsername The Letterboxd username.
 * @returns {Promise<EmbedBuilder>} The configured EmbedBuilder.
 */
async function createDiaryEmbed(latestFilm, tmdbDetails, letterboxdUsername) {
    const embed = new EmbedBuilder()
        .setColor(0xFFFF00) // Yellow color
        .setURL(latestFilm.url);

    const embedTitle = `Last Film by ${letterboxdUsername} 🎬`;
    embed.setTitle(embedTitle);

    let description = `**Film:** ${latestFilm.title} (${latestFilm.year})\n`;
    description += `**Watched:** ${formatDateEn(latestFilm.watchedDateFull || latestFilm.watchedDate)}\n`;
    description += `**Rating:** ${convertRatingToStars(latestFilm.rating)}\n`;

    embed.setDescription(description);

    if (tmdbDetails) {
        embed.setImage(getTmdbPosterUrl(tmdbDetails.poster_path, 'w500')); // Set main image as TMDB poster

        const roundedRating = tmdbDetails.vote_average ? parseFloat(tmdbDetails.vote_average).toFixed(1) : 'N/A';
        const votesFormatted = tmdbDetails.vote_count ? `${tmdbDetails.vote_count.toLocaleString('en-US')} Votes` : 'N/A';

        embed.addFields(
            {
                name: 'Rating (TMDB)',
                value: `${roundedRating} (${votesFormatted})`,
                inline: true
            },
            {
                name: 'Genres (TMDB)',
                value: tmdbDetails.genres?.join(', ') || 'N/A',
                inline: true
            },
            {
                name: 'Synopsis (TMDB)',
                value: tmdbDetails.overview ? tmdbDetails.overview.substring(0, 500) + '...' : (tmdbDetails.overview_en ? tmdbDetails.overview_en.substring(0, 500) + '...' : 'N/A'),
                inline: false
            }
        );
    }

    embed.setFooter(null); // Remove default footer if any

    return embed;
}

/**
 * Creates an embed for the latest review by a user.
 * @param {Object} reviewDetails Latest review details from Letterboxd.
 * @param {Object|null} tmdbDetails TMDB details for the film.
 * @param {string} letterboxdUsername The Letterboxd username.
 * @returns {Promise<EmbedBuilder>} The configured EmbedBuilder.
 */
async function createReviewEmbed(reviewDetails, tmdbDetails, letterboxdUsername) {
    const embed = new EmbedBuilder()
        .setColor(0xAA00AA) // Purple color
        .setURL(reviewDetails.reviewUrl);

    const embedTitle = `Latest Review by ${letterboxdUsername} 📝`;
    embed.setTitle(embedTitle);

    let description = `**Film:** ${reviewDetails.filmTitle} (${reviewDetails.filmYear})\n`;

    if (tmdbDetails && tmdbDetails.genres && tmdbDetails.genres.length > 0) {
        description += `**Genres:** ${tmdbDetails.genres.join(', ')}\n`;
    } else {
        description += `**Genres:** N/A\n`;
    }

    description += `**Written:** ${formatDateEn(reviewDetails.reviewDate)}\n`;
    description += `**Rating:** ${convertRatingToStars(reviewDetails.rating)}\n\n`;

    // Truncate long reviews and provide a link to the full review
    if (reviewDetails.reviewText.length > 700) {
        description += `${reviewDetails.reviewText.substring(0, 700)}...\n`;
        description += `[Read full review here](${reviewDetails.reviewUrl})\n`;
    } else {
        description += `${reviewDetails.reviewText}\n`;
    }

    embed.setDescription(description);

    if (tmdbDetails) {
        embed.setThumbnail(getTmdbPosterUrl(tmdbDetails.poster_path, 'w92')); // Set poster as thumbnail
    }

    embed.setFooter(null);

    return embed;
}

/**
 * Creates an embed for daily watched films.
 * @param {Array<Object>} dailyFilms Array of film objects watched on a specific day.
 * @param {string} letterboxdUsername The Letterboxd username.
 * @param {string} displayDate Formatted date for display.
 * @returns {Promise<EmbedBuilder>} The configured EmbedBuilder.
 */
async function createDailyDiaryEmbed(dailyFilms, letterboxdUsername, displayDate) {
    const embed = new EmbedBuilder()
        .setColor(0x00FF00) // Green color
        .setTitle(`Diary of ${letterboxdUsername} on ${displayDate} 🗓️`);

    let description = '';
    if (dailyFilms.length > 0) {
        for (const filmData of dailyFilms) {
            description += `**- ${filmData.title}** (${filmData.year})\n`;
            description += `  Rating: ${convertRatingToStars(filmData.rating)}\n`;
            if (filmData.tmdbDetails) {
                description += `  Genres (TMDB): ${filmData.tmdbDetails.genres?.join(', ') || 'N/A'}\n`;
            }
            description += `  [View on Letterboxd](${filmData.url})\n\n`;
        }
    } else {
        description = `No films watched on this date.`;
    }
    embed.setDescription(description.substring(0, 4096)); // Ensure description does not exceed Discord limit

    if (dailyFilms[0]?.tmdbDetails?.poster_path) {
        embed.setThumbnail(getTmdbPosterUrl(dailyFilms[0].tmdbDetails.poster_path, 'w92')); // Use first film's poster as thumbnail
    }

    embed.setFooter(null);

    return embed;
}

/**
 * Creates an embed and a grid image for a user's favorite films.
 * @param {Array<Object>} favoriteFilms Array of favorite film objects.
 * @param {string} letterboxdUsername The Letterboxd username.
 * @returns {Promise<Object>} An object containing the EmbedBuilder and the AttachmentBuilder (the image).
 */
async function createFavoritesEmbed(favoriteFilms, letterboxdUsername) {
    const embed = new EmbedBuilder()
        .setColor(0xFF00FF) // Pink/Magenta color
        .setTitle(`Favorite Films of ${letterboxdUsername} ❤️`);

    let attachment = null;
    let imageFailureMessage = '';

    // Create a list of films for the embed description
    const filmListDescription = favoriteFilms.map((film, index) =>
        `${index + 1}. **[${film.title} (${film.year})](https://letterboxd.com/film/${film.slug}/)**`
    ).join('\n');
    embed.setDescription(filmListDescription);

    // Get poster URLs for the favorite films
    const posterUrls = favoriteFilms.map(film =>
        film.tmdbDetails?.poster_path ? getTmdbPosterUrl(film.tmdbDetails.poster_path, 'w342') : null
    ).filter(url => url !== null); // Filter out null URLs

    if (posterUrls.length > 0) {
        // Download all posters in parallel
        const posterBuffers = await Promise.all(
            posterUrls.map(async url => {
                try {
                    const response = await axios.get(url, { responseType: 'arraybuffer' });
                    return response.data;
                } catch (error) {
                    console.error(`Error downloading poster from ${url}:`, error.message);
                    // Return a placeholder grey image if download fails
                    return sharp({ create: { width: 342, height: 513, channels: 4, background: { r: 100, g: 100, b: 100, alpha: 1 } } }).png().toBuffer();
                }
            })
        );

        // Define dimensions for the poster grid
        const posterWidth = 342;
        const posterHeight = 513;
        const gap = 10; // Gap between posters
        const numCols = Math.min(posterUrls.length, 2); // Max 2 columns
        const numRows = Math.ceil(posterUrls.length / 2);
        const outputWidth = numCols * posterWidth + (numCols - 1) * gap;
        const outputHeight = numRows * posterHeight + (numRows - 1) * gap;

        // Prepare composite operations for Sharp
        const compositeImages = posterBuffers.map((buffer, i) => ({
            input: buffer,
            left: (i % 2) * (posterWidth + gap),
            top: Math.floor(i / 2) * (posterHeight + gap)
        }));

        try {
            // Compose the grid image using Sharp
            const combinedImageBuffer = await sharp({ create: { width: outputWidth, height: outputHeight, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
                .composite(compositeImages).png().toBuffer();
            attachment = new AttachmentBuilder(combinedImageBuffer, { name: 'favorites_grid.png' });
        } catch (sharpError) {
            console.error('Error composing image with sharp:', sharpError.message);
            imageFailureMessage = 'An error occurred while generating the poster grid image.';
            attachment = null;
        }
    } else {
        imageFailureMessage = 'Could not retrieve favorite film posters.';
    }

    // Add image generation failure message to description if applicable
    if (imageFailureMessage) {
        embed.setDescription((embed.description || '') + `\n\n${imageFailureMessage}`);
    }

    return { embed, attachment };
}

/**
 * Creates an embed for displaying details of a single movie.
 * @param {Object} movie TMDB movie object.
 * @param {string|null} posterUrl URL for the movie poster.
 * @param {Array<string>} genreNames Array of genre names.
 * @param {string} filmUrl URL for the movie (Letterboxd or TMDB).
 * @returns {EmbedBuilder} The configured EmbedBuilder.
 */
function createMovieEmbed(movie, posterUrl, genreNames, filmUrl) {
    const embed = new EmbedBuilder()
        .setColor(0x0099ff) // A nice blue color
        .setTitle(movie.title || 'Unknown Title')
        .setURL(filmUrl);

    if (movie.release_date) {
        const year = new Date(movie.release_date).getFullYear();
        embed.setTitle(`${movie.title || 'Unknown Title'} (${year})`);
    }

    if (movie.overview) {
        // Truncate overview if too long
        embed.setDescription(movie.overview.substring(0, 500) + (movie.overview.length > 500 ? '...' : ''));
    } else {
        embed.setDescription('No synopsis available.');
    }

    if (posterUrl) {
        embed.setThumbnail(posterUrl);
    }

    if (movie.vote_average) {
        const rating = parseFloat(movie.vote_average).toFixed(1);
        embed.addFields({ name: 'TMDB Rating', value: `${rating}/10`, inline: true });
    }
    
    // Genres: Displaying names
    if (genreNames && genreNames.length > 0) {
        embed.addFields({ name: 'Genres', value: genreNames.join(', '), inline: true });
    }

    return embed;
}


/**
 * Creates an embed and a grid image for films (generic for Likes, Watched Films).
 * Supports hyperlinks and incomplete grids with transparent backgrounds.
 * @param {Array<Object>} films Array of film objects with slug, title, year, posterUrl, and optionally tmdbUrl.
 * @param {string} gridTitle The title of the grid (e.g., "Liked Films of X", "Watched Films Today by Y").
 * @param {number} cols Number of columns for the grid.
 * @param {number} rows Number of rows for the grid.
 * @returns {Promise<Object>} An object containing the EmbedBuilder and the AttachmentBuilder (the image).
 */
async function createGridImage(films, gridTitle, cols, rows) {
    // Generate description with hyperlinks for each film
    const filmListDescription = films
        .map((film, index) => {
            const filmLink = film.tmdbUrl || (film.slug ? `https://letterboxd.com/film/${film.slug}/` : '#');
            return `${index + 1}. **[${film.title || 'Unknown Film'} (${film.year || '????'})](${filmLink})**`;
        })
        .join('\n');
    
    // Debug: Check the generated description string
    console.log("[createGridImage Debug] Generated filmListDescription (inside function):", filmListDescription);

    // Create the EmbedBuilder with the generated description
    const embed = new EmbedBuilder()
        .setColor(0x6f52e3) // A purple color
        .setTitle(`Grid of ${gridTitle}`)
        .setDescription(filmListDescription || 'No films found to display in the grid.'); 
    
    // Debug: Check the description immediately after embed creation
    console.log("[createGridImage Debug] Embed description after construction:", embed.description);


    let attachment = null;
    const requiredFilms = cols * rows; // Total number of spots in the grid

    const posterPromises = [];
    for (let i = 0; i < requiredFilms; i++) {
        const film = films[i]; 
        if (film && film.posterUrl) {
            // Push a promise to download the poster
            posterPromises.push(axios.get(film.posterUrl, { responseType: 'arraybuffer' })
                .then(response => response.data)
                .catch(error => {
                    console.error(`Error downloading poster for ${film.title} (${film.posterUrl}):`, error.message);
                    return null; // Return null if download fails
                })
            );
        } else {
            posterPromises.push(Promise.resolve(null)); // Push a resolved promise for empty slots
        }
    }
    const posterBuffers = await Promise.all(posterPromises); // Wait for all posters to download

    // Define poster and grid dimensions
    const posterWidth = 150;
    const posterHeight = 225;
    const gap = 10;
    const numCols = cols;
    const numRows = rows;
    const outputWidth = numCols * posterWidth + (numCols - 1) * gap;
    const outputHeight = numRows * posterHeight + (numRows - 1) * gap;

    const compositeImages = [];
    for (let i = 0; i < requiredFilms; i++) {
        const buffer = posterBuffers[i];
        if (buffer) {
            // Resize and add poster to composite operations
            compositeImages.push({
                input: await sharp(buffer).resize(posterWidth, posterHeight).toBuffer(),
                left: Math.floor(i % numCols) * (posterWidth + gap),
                top: Math.floor(i / numCols) * (posterHeight + gap)
            });
        }
    }
    
    try {
        // Create the composite image with a transparent background
        const combinedImageBuffer = await sharp({
            create: {
                width: outputWidth,
                height: outputHeight,
                channels: 4,
                background: { r: 0, g: 0, b: 0, alpha: 0 } // Transparent background
            }
        })
        .composite(compositeImages)
        .png()
        .toBuffer();
        attachment = new AttachmentBuilder(combinedImageBuffer, { name: `grid_${cols}x${rows}.png` });
    } catch (sharpError) {
        console.error('Error composing grid image with sharp:', sharpError.message);
        embed.setFooter({ text: 'An error occurred while generating the grid image.' });
    }

    // Debug: Check the embed description just before returning
    console.log("[createGridImage Debug] Embed description RIGHT BEFORE RETURN:", embed.description);

    return { embed, attachment };
}

/**
 * Creates an embed for a Letterboxd user's profile statistics.
 * @param {Object} profileStats User's profile statistics.
 * @param {string} username The Letterboxd username.
 * @returns {Object} An object containing the EmbedBuilder.
 */
async function createProfileEmbed(profileStats, username) {
    const embed = new EmbedBuilder()
        .setColor(0xFFFFFF) // White color
        .setTitle(`Letterboxd Profile of ${username}`)
        .setURL(profileStats.profileUrl) 
        .setThumbnail(profileStats.userAvatarUrl || null); 

    embed.setFooter(null);

    const fields = [];

    // Add various profile statistics as fields
    if (profileStats.totalFilmsWatched !== 'N/A') {
        fields.push({
            name: '🎬 Films Watched:',
            value: profileStats.totalFilmsWatched,
            inline: true
        });
    }
    if (profileStats.filmsThisYear !== 'N/A') {
        fields.push({
            name: '📅 Films This Year:',
            value: profileStats.filmsThisYear,
            inline: true
        });
    }
    // Add an empty field for spacing if needed
    if (profileStats.totalFilmsWatched !== 'N/A' || profileStats.filmsThisYear !== 'N/A') {
        fields.push({ name: '\u200b', value: '\u200b', inline: false }); 
    }

    if (profileStats.following !== 'N/A') {
        fields.push({
            name: '🤝 Following:',
            value: profileStats.following,
            inline: true
        });
    }
    if (profileStats.followers !== 'N/A') {
        fields.push({
            name: '👥 Followers:',
            value: profileStats.followers,
            inline: true
        });
    }
    if (profileStats.following !== 'N/A' || profileStats.followers !== 'N/A') {
        fields.push({ name: '\u200b', value: '\u200b', inline: false });
    }

    if (profileStats.watchlistCount !== 'N/A') {
        fields.push({
            name: '👀 Watchlist:',
            value: profileStats.watchlistCount,
            inline: true
        });
    }
    if (profileStats.tagsList && profileStats.tagsList.length > 0) {
        fields.push({
            name: '🏷️ Tags Used:',
            value: profileStats.tagsList.join(', '),
            inline: true
        });
    } else if (profileStats.tagsList && profileStats.tagsList.length === 0) {
        fields.push({
            name: '🏷️ Tags Used:',
            value: 'None',
            inline: true
        });
    }

    if (fields.length > 0) {
        embed.addFields(fields);
    } else {
        embed.setDescription('Could not retrieve profile statistics.');
    }

    return { embed };
}

/**
 * Creates an embed that simulates a Letterboxd Cinephile ID Card.
 * @param {Object} cardData Object containing data for the card.
 * @param {string} cardData.username Letterboxd username.
 * @param {string} cardData.avatarUrl URL of the user's avatar.
 * @param {string} cardData.totalFilms Total films watched.
 * @param {string} cardData.filmsThisYear Films watched this year.
 * @param {string} cardData.followers Number of followers.
 * @param {string} cardData.following Number of following.
 * @param {string} cardData.watchlistCount Number of watchlist films.
 * @param {string} cardData.mostCommonRating The most common rating given by the user.
 * @param {string} cardData.randomQuote A random movie quote.
 * @param {string} cardData.profileUrl URL of the user's Letterboxd profile.
 * @returns {Object} An object containing the EmbedBuilder and the AttachmentBuilder.
 */
async function createLetterIDEmbed(cardData) {
    try {
        const templateImage = await sharp(idCardTemplatePath);
        const templateMetadata = await templateImage.metadata();

        // Download and resize avatar
        const avatarBuffer = await axios.get(cardData.avatarUrl, { responseType: 'arraybuffer' });
        const avatarWidth = 310;
        const avatarHeight = 352;
        const avatarX = 25;
        const avatarY = 23;
        const avatarImage = await sharp(avatarBuffer.data).resize(avatarWidth, avatarHeight, { fit: 'cover' }).toBuffer();

        // Generate QR Code with transparent background
        const qrCodeOptions = {
            errorCorrectionLevel: 'H', // High error correction
            width: 90,
            color: {
                dark: '#000000FF', // Opaque black for QR code modules
                light: '#00000000' // Fully transparent background
            }
        };
        const qrCodeBuffer = await QRCode.toBuffer(cardData.profileUrl, qrCodeOptions);

        // Resize the generated transparent QR Code
        const qrCodeImage = await sharp(qrCodeBuffer)
            .resize(90, 90)
            .toBuffer();

        // Array to hold all image composite operations
        let compositeOperations = [];

        // Add avatar and QR code to composite operations
        compositeOperations.push({ input: avatarImage, top: avatarY, left: avatarX }); 
        const qrCodeX = 880; 
        const qrCodeY = 510; 
        compositeOperations.push({ input: qrCodeImage, top: qrCodeY, left: qrCodeX });

        // --- TEXT RENDERING: Render text as SVG and then composite it onto the image ---
        const overlaysForTextComposite = [];

        /**
         * Adds an SVG text overlay to the image composite operations.
         * @param {string} text The text content.
         * @param {number} x X-coordinate for the text.
         * @param {number} y Y-coordinate for the text.
         * @param {number} size Font size in pixels.
         * @param {string} fontPathOrName Path to a TTF font file or a generic font name.
         * @param {Object} color RGBA color object (default: black).
         * @param {string} weight Font weight (e.g., 'normal', 'bold').
         */
        const addTextSvgOverlay = (text, x, y, size, fontPathOrName, color = { r: 0, g: 0, b: 0, alpha: 255 }, weight = 'normal') => {
            if (!text || text === 'N/A') return; // Skip if text is empty or N/A

            const cssColor = `rgba(${color.r},${color.g},${color.b},${color.alpha / 255})`;
            let fontFamily = 'Arial';
            let fontSrc = '';

            // If a TTF font path is provided, define a custom font-face
            if (fontPathOrName && fontPathOrName.endsWith('.ttf')) {
                // Use a generic name for font-family, actual path is in src
                fontFamily = `'Bastliga One'`; // Using a generic name for the font-face definition
                fontSrc = `@font-face { font-family: ${fontFamily}; src: url('${fontPathOrName}') format('truetype'); }`;
            } else if (fontPathOrName) {
                fontFamily = `'${fontPathOrName}'`; // Use the provided font name directly
            }

            // Create SVG string for the text
            const svgText = `
                <svg width="${templateMetadata.width}" height="${templateMetadata.height}">
                    <style>
                        ${fontSrc}
                        .text {
                            font-family: ${fontFamily}, sans-serif;
                            font-size: ${size}px;
                            fill: ${cssColor};
                            font-weight: ${weight};
                        }
                    </style>
                    <text x="${x}" y="${y}" class="text">${text}</text>
                </svg>
            `;
            overlaysForTextComposite.push({ input: Buffer.from(svgText), top: 0, left: 0 });
        };


        // Add text fields based on McLovin ID template coordinates and styling
        // Username (similar to "McLOVIN" on McLovin ID)
        addTextSvgOverlay(cardData.username.toUpperCase(), 25, 508, 32, 'Arial', { r: 0, g: 0, b: 0, alpha: 255 }, 'bold');

        // Signature (similar to "MCLOVIN" signature on McLovin ID)
        // The custom font is applied here.
        addTextSvgOverlay(cardData.username, 500, 500, 80, signatureFontPath);

        // Statistics data - Adjusted to align with the right side of the photo on the McLovin ID
        const statXStart = 370;
        const statLineHeight = 35;
        const statFontSize = 22;

        // Adjust this value to move all statistics down
        const newStatYStart = 140; 

        // Statistics fields
        addTextSvgOverlay(`FILMS WATCHED: ${cardData.totalFilms || 'N/A'}`, statXStart, newStatYStart, statFontSize, 'Arial', { r: 0, g: 0, b: 0, alpha: 255 }, 'bold');
        addTextSvgOverlay(`FILMS THIS YEAR: ${cardData.filmsThisYear || 'N/A'}`, statXStart, newStatYStart + statLineHeight, statFontSize, 'Arial', { r: 0, g: 0, b: 0, alpha: 255 }, 'bold');

        addTextSvgOverlay(`FOLLOWERS: ${cardData.followers || 'N/A'}`, statXStart, newStatYStart + statLineHeight * 2, statFontSize, 'Arial', { r: 0, g: 0, b: 0, alpha: 255 }, 'bold');
        addTextSvgOverlay(`FOLLOWING: ${cardData.following || 'N/A'}`, statXStart, newStatYStart + statLineHeight * 3, statFontSize, 'Arial', { r: 0, g: 0, b: 0, alpha: 255 }, 'bold');

        addTextSvgOverlay(`WATCHLIST: ${cardData.watchlistCount || 'N/A'}`, statXStart, newStatYStart + statLineHeight * 4, statFontSize, 'Arial', { r: 0, g: 0, b: 0, alpha: 255 }, 'bold');
        addTextSvgOverlay(`MOST COMMON RATING: ${cardData.mostCommonRating || 'N/A'}`, statXStart, newStatYStart + statLineHeight * 5, statFontSize, 'Arial', { r: 0, g: 0, b: 0, alpha: 255 }, 'bold');

        // Random movie quote
        addTextSvgOverlay(`"${cardData.randomQuote}"`, statXStart, newStatYStart + statLineHeight * 6.5 + 20, 18, 'Arial', { r: 70, g: 70, b: 70, alpha: 255 }); 


        // --- FINAL IMAGE COMPOSITION ---
        // Composite all layers (template, avatar, QR code, and text SVGs)
        const imageBuffer = await sharp(idCardTemplatePath)
            .composite([
                ...compositeOperations,
                ...overlaysForTextComposite
            ])
            .png()
            .toBuffer();

        // Create an AttachmentBuilder for the generated image
        const attachment = new AttachmentBuilder(imageBuffer, { name: `letterid_${cardData.username}.png` });

        // Create the EmbedBuilder
        const embed = new EmbedBuilder()
            .setColor(0x000000) // Black color
            .setTitle(`Cinephile ID Card for ${cardData.username}`)
            .setImage(`attachment://letterid_${cardData.username}.png`) // Link the image attachment
            .setURL(cardData.profileUrl);

        return { embed, attachment };

    } catch (error) {
        console.error('Error creating Letterboxd ID card:', error);
        // Return an error embed if something goes wrong
        const embed = new EmbedBuilder()
            .setColor(0xFF0000) // Red color for error
            .setTitle('Error generating Cinephile ID Card')
            .setDescription('An error occurred while creating your ID card. Please try again later.')
            .setFooter({ text: 'LetterBotd' });
        return { embed, attachment: null };
    }
}

// --- FINAL EXPORT BLOCK OF ALL FUNCTIONS ---
// Export all functions for use in other modules
export {
    createDiaryEmbed,
    createReviewEmbed,
    createDailyDiaryEmbed,
    createFavoritesEmbed,
    createGridImage, 
    createProfileEmbed,
    formatDateEn,
    convertRatingToStars,
    createMovieEmbed,
    createLetterIDEmbed
};