import { EmbedBuilder, AttachmentBuilder } from 'discord.js';
import { getTmdbPosterUrl } from '../api/tmdb.js';
import sharp from 'sharp';
import axios from 'axios';
import QRCode from 'qrcode';
import path from 'node:path';
import { fileURLToPath } from 'node:url'; 
import fs from 'node:fs/promises'; 

console.log('[formatEmbed.js] File loaded and executing font loaders.');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const idCardTemplatePath = path.join(__dirname, '..', 'assets', 'letterid_template.png');
const dancingScriptBoldFontPath = path.join(__dirname, '..', 'assets', 'DancingScript-Bold.ttf'); 
const arialBlackFontPath = path.join(__dirname, '..', 'assets', 'ariblk.ttf');

let dancingScriptBoldFontBase64 = null; 
let arialBlackFontBase64 = null;

async function loadDancingScriptBoldFontBase64() {
    if (!dancingScriptBoldFontBase64) {
        try {
            const fontBuffer = await fs.readFile(dancingScriptBoldFontPath);
            dancingScriptBoldFontBase64 = fontBuffer.toString('base64');
            console.log('[formatEmbed.js] Dancing Script Bold font loaded as Base64 successfully.');
        } catch (e) {
            console.error('[formatEmbed.js] Error loading Dancing Script Bold font as Base64:', e);
            dancingScriptBoldFontBase64 = null; 
        }
    }
}

async function loadArialBlackFontBase64() {
    if (!arialBlackFontBase64) {
        try {
            const fontBuffer = await fs.readFile(arialBlackFontPath);
            arialBlackFontBase64 = fontBuffer.toString('base64');
            console.log('[formatEmbed.js] Arial Black font loaded as Base64 successfully.'); 
        } catch (e) {
            console.error('[formatEmbed.js] Error loading Arial Black font as Base64:', e); 
            arialBlackFontBase64 = null; 
        }
    }
}

loadDancingScriptBoldFontBase64(); 
loadArialBlackFontBase64();


function formatDateEn(dateString) {
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
    const month = date.toLocaleString('en-US', { month: 'short' });
    const yearShort = String(date.getFullYear()).slice(-2);

    return `${day} ${month.charAt(0).toUpperCase() + month.slice(1)} ${yearShort}`;
}

function convertRatingToStars(rating) {
    if (rating === null || isNaN(rating)) return 'Not Rated';

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


async function createDiaryEmbed(latestFilm, tmdbDetails, letterboxdUsername) {
    const embed = new EmbedBuilder()
        .setColor(0xFFFF00) 
        .setURL(latestFilm.url);

    const embedTitle = `Last Film by ${letterboxdUsername} 🎬`;
    embed.setTitle(embedTitle);

    let description = `**Film:** ${latestFilm.title} (${latestFilm.year})\n`;
    description += `**Watched:** ${formatDateEn(latestFilm.watchedDateFull || latestFilm.watchedDate)}\n`;
    description += `**Rating:** ${convertRatingToStars(latestFilm.rating)}\n`;

    embed.setDescription(description);

    if (tmdbDetails) {
        embed.setImage(getTmdbPosterUrl(tmdbDetails.poster_path, 'w500')); 

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

    embed.setFooter(null); 

    return embed;
}

async function createReviewEmbed(reviewDetails, tmdbDetails, letterboxdUsername) {
    const embed = new EmbedBuilder()
        .setColor(0xAA00AA) 
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

    if (reviewDetails.reviewText.length > 700) {
        description += `${reviewDetails.reviewText.substring(0, 700)}...\n`;
        description += `[Read full review here](${reviewDetails.reviewUrl})\n`;
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

async function createDailyDiaryEmbed(dailyFilms, letterboxdUsername, displayDate) {
    const embed = new EmbedBuilder()
        .setColor(0x00FF00) 
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
    embed.setDescription(description.substring(0, 4096)); 

    if (dailyFilms[0]?.tmdbDetails?.poster_path) {
        embed.setThumbnail(getTmdbPosterUrl(dailyFilms[0].tmdbDetails.poster_path, 'w92')); 
    }

    embed.setFooter(null);

    return embed;
}

async function createFavoritesEmbed(favoriteFilms, letterboxdUsername) {
    const embed = new EmbedBuilder()
        .setColor(0xFF00FF) 
        .setTitle(`Favorite Films of ${letterboxdUsername} ❤️`);

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
                    console.error(`Error downloading poster from ${url}:`, error.message);
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
            console.error('Error composing image with sharp:', sharpError.message);
            imageFailureMessage = 'An error occurred while generating the poster grid image.';
            attachment = null;
        }
    } else {
        imageFailureMessage = 'Could not retrieve favorite film posters.';
    }

    if (imageFailureMessage) {
        embed.setDescription((embed.description || '') + `\n\n${imageFailureMessage}`);
    }

    return { embed, attachment };
}

function createMovieEmbed(movie, posterUrl, genreNames, filmUrl) {
    const embed = new EmbedBuilder()
        .setColor(0x0099ff) 
        .setTitle(movie.title || 'Unknown Title')
        .setURL(filmUrl);

    if (movie.release_date) {
        const year = new Date(movie.release_date).getFullYear();
        embed.setTitle(`${movie.title || 'Unknown Title'} (${year})`);
    }

    if (movie.overview) {
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
    
    if (genreNames && genreNames.length > 0) {
        embed.addFields({ name: 'Genres', value: genreNames.join(', '), inline: true });
    }

    return embed;
}


async function createGridImage(films, gridTitle, cols, rows) {
    const filmListDescription = films
        .map((film, index) => {
            const filmLink = film.tmdbUrl || (film.slug ? `https://letterboxd.com/film/${film.slug}/` : '#');
            return `${index + 1}. **[${film.title || 'Unknown Film'} (${film.year || '????'})](${filmLink})**`;
        })
        .join('\n');
    
    console.log("[createGridImage Debug] Generated filmListDescription (inside function):", filmListDescription);

    const embed = new EmbedBuilder()
        .setColor(0x6f52e3) 
        .setTitle(`Grid of ${gridTitle}`)
        .setDescription(filmListDescription || 'No films found to display in the grid.'); 
    
    console.log("[createGridImage Debug] Embed description after construction:", embed.description);


    let attachment = null;
    const requiredFilms = cols * rows; 

    const posterPromises = [];
    for (let i = 0; i < requiredFilms; i++) {
        const film = films[i]; 
        if (film && film.posterUrl) {
            posterPromises.push(axios.get(film.posterUrl, { responseType: 'arraybuffer' })
                .then(response => response.data)
                .catch(error => {
                    console.error(`Error downloading poster for ${film.title} (${film.posterUrl}):`, error.message);
                    return null; 
                })
            );
        } else {
            posterPromises.push(Promise.resolve(null)); 
        }
    }
    const posterBuffers = await Promise.all(posterPromises); 

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
            compositeImages.push({
                input: await sharp(buffer).resize(posterWidth, posterHeight).toBuffer(),
                left: Math.floor(i % numCols) * (posterWidth + gap),
                top: Math.floor(i / numCols) * (posterHeight + gap)
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
        console.error('Error composing grid image with sharp:', sharpError.message);
        embed.setFooter({ text: 'An error occurred while generating the grid image.' });
    }

    console.log("[createGridImage Debug] Embed description RIGHT BEFORE RETURN:", embed.description);

    return { embed, attachment };
}

async function createProfileEmbed(profileStats, username) {
    const embed = new EmbedBuilder()
        .setColor(0xFFFFFF) 
        .setTitle(`Letterboxd Profile of ${username}`)
        .setURL(profileStats.profileUrl) 
        .setThumbnail(profileStats.userAvatarUrl || null); 

    embed.setFooter(null);

    const fields = [];

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

async function createLetterIDEmbed(cardData) {
    try {
        const templateImage = await sharp(idCardTemplatePath);
        const templateMetadata = await templateImage.metadata();

        const avatarBuffer = await axios.get(cardData.avatarUrl, { responseType: 'arraybuffer' });
        const avatarWidth = 420;
        const avatarHeight = 545;
        const avatarX = 13;
        const avatarY = 43;
        const avatarImage = await sharp(avatarBuffer.data).resize(avatarWidth, avatarHeight, { fit: 'cover' }).toBuffer();

        const qrCodeOptions = {
            errorCorrectionLevel: 'H', 
            width: 180,
            color: {
                dark: '#000000FF', 
                light: '#00000000' 
            }
        };
        const qrCodeBuffer = await QRCode.toBuffer(cardData.profileUrl, qrCodeOptions);

        const qrCodeImage = await sharp(qrCodeBuffer)
            .resize(130, 130)
            .toBuffer();

        let compositeOperations = [];

        compositeOperations.push({ input: avatarImage, top: avatarY, left: avatarX }); 
        const qrCodeX = 1350; 
        const qrCodeY = 800; 
        compositeOperations.push({ input: qrCodeImage, top: qrCodeY, left: qrCodeX });

        const overlaysForTextComposite = [];

        const addTextSvgOverlay = (text, x, y, size, fontIdentifier, color = { r: 0, g: 0, b: 0, alpha: 255 }, weight = 'normal') => { 
            if (!text || text === 'N/A') return; 

            const cssColor = `rgba(${color.r},${color.g},${color.b},${color.alpha / 255})`;
            let fontFamily = 'Arial'; 
            let fontSrc = '';

            if (fontIdentifier === dancingScriptBoldFontPath && dancingScriptBoldFontBase64) { 
                fontFamily = `'DancingScriptBoldBase64'`; 
                fontSrc = `@font-face { font-family: ${fontFamily}; src: url('data:font/ttf;base64,${dancingScriptBoldFontBase64}') format('truetype'); }`;
            } else if (fontIdentifier === arialBlackFontPath && arialBlackFontBase64) {
                fontFamily = `'ArialBlackBase64'`; 
                fontSrc = `@font-face { font-family: ${fontFamily}; src: url('data:font/ttf;base64,${arialBlackFontBase64}') format('truetype'); }`;
            } 
            else if (typeof fontIdentifier === 'string' && !fontIdentifier.endsWith('.ttf')) {
                fontFamily = `'${fontIdentifier}'`; 
            }
            else if (typeof fontIdentifier === 'string' && fontIdentifier.endsWith('.ttf')) {
                try {
                    const fontBuffer = fs.readFileSync(fontIdentifier); 
                    fontSrc = `@font-face { font-family: 'DynamicTTFFont'; src: url('data:font/ttf;base64,${fontBuffer.toString('base64')}') format('truetype'); }`;
                    fontFamily = `'DynamicTTFFont'`;
                } catch (e) {
                    console.error(`[formatEmbed.js] Failed to load dynamic font ${fontIdentifier}:`, e);
                    fontFamily = 'sans-serif';
                }
            }


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


        addTextSvgOverlay(cardData.username.toUpperCase(), 15, 785, 55, arialBlackFontPath, { r: 0, g: 0, b: 0, alpha: 255 }, 'bold');

        addTextSvgOverlay(cardData.username, 650, 700, 80, dancingScriptBoldFontPath); 
        const statXStart = 480;
        const statLineHeight = 60;
        const statFontSize = 50;

        const newStatYStart = 250; 

        addTextSvgOverlay(`FILMS WATCHED: ${cardData.totalFilms || 'N/A'}`, statXStart, newStatYStart, statFontSize, arialBlackFontPath, { r: 0, g: 0, b: 0, alpha: 255 }, 'bold');
        addTextSvgOverlay(`FILMS THIS YEAR: ${cardData.filmsThisYear || 'N/A'}`, statXStart, newStatYStart + statLineHeight, statFontSize, arialBlackFontPath, { r: 0, g: 0, b: 0, alpha: 255 }, 'bold');

        addTextSvgOverlay(`FOLLOWERS: ${cardData.followers || 'N/A'}`, statXStart, newStatYStart + statLineHeight * 2, statFontSize, arialBlackFontPath, { r: 0, g: 0, b: 0, alpha: 255 }, 'bold');
        addTextSvgOverlay(`FOLLOWING: ${cardData.following || 'N/A'}`, statXStart, newStatYStart + statLineHeight * 3, statFontSize, arialBlackFontPath, { r: 0, g: 0, b: 0, alpha: 255 }, 'bold');

        addTextSvgOverlay(`WATCHLIST: ${cardData.watchlistCount || 'N/A'}`, statXStart, newStatYStart + statLineHeight * 4, statFontSize, arialBlackFontPath, { r: 0, g: 0, b: 0, alpha: 255 }, 'bold');
        addTextSvgOverlay(`MOST COMMON RATING: ${cardData.mostCommonRating || 'N/A'}`, statXStart, newStatYStart + statLineHeight * 5, statFontSize, arialBlackFontPath, { r: 0, g: 0, b: 0, alpha: 255 }, 'bold');

        addTextSvgOverlay(`"${cardData.randomQuote}"`, statXStart, newStatYStart + statLineHeight * 5.5 + 20, 18, 'Arial', { r: 70, g: 70, b: 70, alpha: 255 }); 


        const imageBuffer = await sharp(idCardTemplatePath)
            .composite([
                ...compositeOperations,
                ...overlaysForTextComposite
            ])
            .png()
            .toBuffer();

        const attachment = new AttachmentBuilder(imageBuffer, { name: `letterid_${cardData.username}.png` });

        const embed = new EmbedBuilder()
            .setColor(0x000000) 
            .setTitle(`Cinephile ID Card for ${cardData.username}`)
            .setImage(`attachment://letterid_${cardData.username}.png`) 
            .setURL(cardData.profileUrl);

        return { embed, attachment };

    } catch (error) {
        console.error('Error creating Letterboxd ID card:', error);
        const embed = new EmbedBuilder()
            .setColor(0xFF0000) 
            .setTitle('Error generating Cinephile ID Card')
            .setDescription('An error occurred while creating your ID card! Please try again later.')
            .setFooter({ text: 'LetterBotd' });
        return { embed, attachment: null };
    }
}

async function createQuizEmbed(movie, contentType, getTmdbPosterUrlFn) {
    const embed = new EmbedBuilder()
        .setColor(0x7289DA) 
        .setTitle('🎬 Guess the Movie! 🍿');

    let descriptionContent = ''; 
    let hasImage = false; 

    if (contentType === 'synopsis' || contentType === 'both') {
        descriptionContent = movie.overview ? movie.overview.substring(0, 1000) + (movie.overview.length > 1000 ? '...' : '') : ''; 
    }

    if (contentType === 'poster' || contentType === 'both') {
        if (movie.poster_path) {
            const posterUrl = getTmdbPosterUrlFn(movie.poster_path, 'w500');
            embed.setImage(posterUrl);
            hasImage = true;
        }
    }

    let finalDescription = '';
    if (descriptionContent.trim().length > 0) {
        finalDescription = descriptionContent;
    } else if (contentType === 'synopsis' || contentType === 'both') {
        finalDescription = 'No synopsis available for this movie.';
    } else if (contentType === 'poster' && !hasImage) {
        finalDescription = 'No poster available for this movie.';
    } else { 
        finalDescription = 'No clues available for this movie.';
    }

    finalDescription += '\n\nYou have 30 seconds! Type your guess in the chat.';
    
    embed.setDescription(finalDescription);
    embed.setFooter(null); 

    return embed;
}

async function revealQuizAnswer(movie, correctGuesser, finalFilmUrl, getTmdbPosterUrlFn) {
    const embed = new EmbedBuilder()
        .setColor(correctGuesser ? 0x00FF00 : 0xFF0000) 
        .setTitle(`The movie was: ${movie.title} (${new Date(movie.release_date).getFullYear()}) 🎉`)
        .setURL(finalFilmUrl);

    if (movie.poster_path) {
        embed.setThumbnail(getTmdbPosterUrlFn(movie.poster_path, 'w92')); 
    }

    let description = `**Synopsis:** ${movie.overview ? movie.overview.substring(0, 700) + (movie.overview.length > 700 ? '...' : '') : 'N/A'}\n\n`;
    description += `[View on Letterboxd/TMDB](${finalFilmUrl})\n\n`;

    if (correctGuesser) {
        description += `**Congratulations, ${correctGuesser.displayName || correctGuesser.username}! You guessed it!** 🏆`;
    } else {
        description += '**Time\'s up! Nobody guessed correctly this time.** 😔';
    }

    embed.setDescription(description.length > 0 ? description : ' ');

    return embed;
}

function createTasteEmbed(
    user1DisplayName,
    user2DisplayName,
    lbUsername1,
    lbUsername2,
    compatibilityPercentage,
    commonFilmsCount,
    mostAgreedFilms,
    mostDisagreedFilms
) {
    const embed = new EmbedBuilder()
        .setColor(0xFFA500) 
        .setTitle(`Taste Compatibility: ${user1DisplayName} vs. ${user2DisplayName} 🔗`);

    let description = `Comparing **[${lbUsername1}](https://letterboxd.com/${lbUsername1}/)** and **[${lbUsername2}](https://letterboxd.com/${lbUsername2}/)**:\n`; 
    
    let compatibilityEmoji = '';
    if (compatibilityPercentage > 90) {
        compatibilityEmoji = '❤️';
    } else if (compatibilityPercentage >= 70) { 
        compatibilityEmoji = '✌️';
    } else if (compatibilityPercentage >= 50) { 
        compatibilityEmoji = '💀';
    } else { 
        compatibilityEmoji = '💩';
    }

    description += `## **${compatibilityPercentage}% Compatibility ${compatibilityEmoji}**\n`;
    description += `Based on **${commonFilmsCount}** films watched by both users.\n\n`;

    if (commonFilmsCount > 0) {
        if (mostAgreedFilms.length > 0) {
            description += '**Most Agreed Films (Lowest Rating Difference):**\n';
            mostAgreedFilms.forEach(film => {
                const filmUrl = `https://letterboxd.com/film/${film.slug}/`;
                description += `• [${film.title} (${film.year || 'N/A'})](${filmUrl}) - ${convertRatingToStars(film.rating1)} vs ${convertRatingToStars(film.rating2)}\n`;
            });
            description += '\n';
        }

        if (mostDisagreedFilms.length > 0) {
            description += '**Most Disagreed Films (Highest Rating Difference):**\n';
            mostDisagreedFilms.forEach(film => {
                const filmUrl = `https://letterboxd.com/film/${film.slug}/`;
                description += `• [${film.title} (${film.year || 'N/A'})](${filmUrl}) - ${convertRatingToStars(film.rating1)} vs ${convertRatingToStars(film.rating2)}\n`;
            });
            description += '\n';
        }
    } else {
        description += 'No common films found in their diaries to compare taste.';
    }

    embed.setDescription(description.substring(0, 4096));

    return embed;
}

function revealImpostorAnswer(impostorMovie, guesser = null, isCorrectGuess = false) {
    let title = '';
    let color = 0xFF0000; 

    if (isCorrectGuess) {
        title = `🎉 Correct! ${guesser.displayName || guesser.username} Guessed the Impostor! 🎉`;
        color = 0x00FF00; 
    } else if (guesser) { 
        title = `❌ Incorrect Guess, ${guesser.displayName || guesser.username}! ❌`;
        color = 0xFFA500; 
    } else { 
        title = `⏰ Time's Up! Nobody Guessed the Impostor! ⏰`;
        color = 0xFF0000;
    }

    const embed = new EmbedBuilder()
        .setColor(color)
        .setTitle(title)
        .setURL(`https://www.themoviedb.org/movie/${impostorMovie.id}`); 

    if (impostorMovie.poster_path) {
        embed.setThumbnail(getTmdbPosterUrl(impostorMovie.poster_path, 'w92'));
    }

    let description = `The impostor film was: **[${impostorMovie.title} (${new Date(impostorMovie.release_date).getFullYear() || 'N/A'})](https://www.themoviedb.org/movie/${impostorMovie.id})**!\n\n`;
    description += `**Synopsis:** ${impostorMovie.overview ? impostorMovie.overview.substring(0, 500) + (impostorMovie.overview.length > 500 ? '...' : '') : 'N/A'}\n\n`;

    embed.setDescription(description.length > 0 ? description : ' ');

    return embed;
}

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
    createQuizEmbed,
    revealQuizAnswer,
    createLetterIDEmbed,
    createTasteEmbed,
    revealImpostorAnswer
};