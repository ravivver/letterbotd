// utils/formatEmbed.js

import { EmbedBuilder, AttachmentBuilder } from 'discord.js';
import { getTmdbPosterUrl } from '../api/tmdb.js';
import sharp from 'sharp';
import axios from 'axios';

// --- FUNÇÕES AUXILIARES ---

function formatDateBr(dateString) {
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
                    'Jul': 6, 'Ago': 7, 'Set': 8, 'Out': 9, 'Nov': 10, 'Dez': 11
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
    const month = date.toLocaleString('pt-BR', { month: 'short' });
    const yearShort = String(date.getFullYear()).slice(-2);

    return `${day} ${month.charAt(0).toUpperCase() + month.slice(1)} ${yearShort}`;
}

function convertRatingToStars(rating) {
    if (rating === null || isNaN(rating)) return 'Não avaliado';

    let stars = '';
    const fullStars = Math.floor(rating);
    const halfStar = rating % 1 !== 0;

    for (let i = 0; i < fullStars; i++) {
        stars += '⭐';
    }

    if (halfStar) {
        stars += '½';
    }

    const totalStarsDisplayed = fullStars + (halfStar ? 1 : 0);
    for (let i = totalStarsDisplayed; i < 5; i++) {
        stars += '½';
    }

    return stars;
}


// --- FUNÇÕES DE CRIAÇÃO DE EMBED ---

/**
 * Cria um embed formatado para exibir o último filme assistido no diário.
 * @param {Object} latestFilm Detalhes do filme do Letterboxd (do getDiary.js).
 * @param {Object} tmdbDetails Detalhes do filme do TMDB (do api/tmdb.js).
 * @param {string} letterboxdUsername Nome de usuário do Letterboxd.
 * @returns {EmbedBuilder} O Embed formatado.
 */
async function createDiaryEmbed(latestFilm, tmdbDetails, letterboxdUsername) {
    const embed = new EmbedBuilder()
        .setColor(0xFFFF00) // Amarelo
        .setURL(latestFilm.url);

    const embedTitle = `Último Filme de ${letterboxdUsername} 🎬`;
    embed.setTitle(embedTitle);

    let description = `**Filme:** ${latestFilm.title} (${latestFilm.year})\n`;
    description += `**Assistido:** ${formatDateBr(latestFilm.watchedDateFull || latestFilm.watchedDate)}\n`;
    description += `**Nota:** ${convertRatingToStars(latestFilm.rating)}\n`;

    embed.setDescription(description);

    if (tmdbDetails) {
        embed.setImage(getTmdbPosterUrl(tmdbDetails.poster_path, 'w500'));

        const roundedRating = tmdbDetails.vote_average ? parseFloat(tmdbDetails.vote_average).toFixed(1) : 'N/A';
        const votesFormatted = tmdbDetails.vote_count ? `${tmdbDetails.vote_count.toLocaleString('pt-BR')} Votos` : 'N/A';

        embed.addFields(
            {
                name: 'Rating (TMDB)',
                value: `${roundedRating} (${votesFormatted})`,
                inline: true
            },
            {
                name: 'Gêneros (TMDB)',
                value: tmdbDetails.genres?.join(', ') || 'N/A',
                inline: true
            },
            {
                name: 'Sinopse (TMDB)',
                value: tmdbDetails.overview ? tmdbDetails.overview.substring(0, 500) + '...' : (tmdbDetails.overview_en ? tmdbDetails.overview_en.substring(0, 500) + '...' : 'N/A'),
                inline: false
            }
        );
    }

    embed.setFooter(null);

    return embed;
}

/**
 * Cria um embed formatado para exibir a última review.
 * @param {Object} reviewDetails Detalhes da review do Letterboxd (do getReview.js).
 * @param {Object} tmdbDetails Detalhes do filme do TMDB (do api/tmdb.js).
 * @param {string} letterboxdUsername Nome de usuário do Letterboxd.
 * @returns {EmbedBuilder} O Embed formatado.
 */
async function createReviewEmbed(reviewDetails, tmdbDetails, letterboxdUsername) {
    const embed = new EmbedBuilder()
        .setColor(0xAA00AA) // Cor Roxa para reviews
        .setURL(reviewDetails.reviewUrl);

    const embedTitle = `Última Review de ${letterboxdUsername} 📝`; // Ícone de lápis para review
    embed.setTitle(embedTitle);

    let description = `**Filme:** ${reviewDetails.filmTitle} (${reviewDetails.filmYear})\n`;

    if (tmdbDetails && tmdbDetails.genres && tmdbDetails.genres.length > 0) {
        description += `**Gêneros:** ${tmdbDetails.genres.join(', ')}\n`;
    } else {
        description += `**Gêneros:** N/A\n`;
    }

    description += `**Escrito:** ${formatDateBr(reviewDetails.reviewDate)}\n`;
    description += `**Nota:** ${convertRatingToStars(reviewDetails.rating)}\n\n`;

    if (reviewDetails.reviewText.length > 700) {
        description += `${reviewDetails.reviewText.substring(0, 700)}...\n`;
        description += `[Leia a review completa aqui](${reviewDetails.reviewUrl})\n`;
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

/**
 * Cria um embed formatado para exibir todos os filmes assistidos em um dia específico.
 * @param {Array<Object>} filmsDoDia Lista de filmes assistidos no dia (do getDiary.js).
 * @param {string} letterboxdUsername Nome de usuário do Letterboxd.
 * @param {string} displayDate A data formatada para exibição (ex: "09 Jul 25").
 * @returns {EmbedBuilder} O Embed formatado.
 */
async function createDailyDiaryEmbed(filmsDoDia, letterboxdUsername, displayDate) {
    const embed = new EmbedBuilder()
        .setColor(0x00FF00) // Uma cor verde para o diário diário, para diferenciar
        .setTitle(`Diário de ${letterboxdUsername} em ${displayDate} 🗓️`); // Título com a data

    let description = '';
    if (filmsDoDia.length > 0) {
        for (const filmData of filmsDoDia) {
            description += `**- ${filmData.title}** (${filmData.year})\n`;
            description += `  Nota: ${convertRatingToStars(filmData.rating)}\n`;
            if (filmData.tmdbDetails) {
                description += `  Gêneros (TMDB): ${filmData.tmdbDetails.genres?.join(', ') || 'N/A'}\n`;
            }
            description += `  [Ver no Letterboxd](${filmData.url})\n\n`;
        }
    } else {
        description = `Nenhum filme assistido nesta data.`;
    }
    embed.setDescription(description.substring(0, 4096));

    if (filmsDoDia[0]?.tmdbDetails?.poster_path) {
        embed.setThumbnail(getTmdbPosterUrl(filmsDoDia[0].tmdbDetails.poster_path, 'w92'));
    }

    embed.setFooter(null);

    return embed;
}

/**
 * Cria um embed com uma grade 2x2 dos pôsteres dos filmes favoritos.
 * @param {Array<Object>} favoriteFilms Array de objetos de filmes favoritos com detalhes TMDB.
 * @param {string} letterboxdUsername Nome de usuário do Letterboxd.
 * @returns {Promise<Object>} Um objeto contendo o EmbedBuilder e o AttachmentBuilder (a imagem).
 */
async function createFavoritesEmbed(favoriteFilms, letterboxdUsername) {
    const embed = new EmbedBuilder()
        .setColor(0xFF00FF) // Uma cor vibrante para favoritos (ex: magenta)
        .setTitle(`Filmes Favoritos de ${letterboxdUsername} ❤️`);

    let attachment = null;
    let imageFailureMessage = '';

    const filmListDescription = favoriteFilms.map((film, index) =>
        `${index + 1}. **${film.title}** (${film.year})`
    ).join('\n');
    embed.setDescription(filmListDescription);

    console.log('Debug: Filmes favoritos recebidos para embed:', favoriteFilms.map(f => `${f.title} (${f.year}) - Slug: ${f.slug}`));

    const posterUrls = favoriteFilms.map(film =>
        film.tmdbDetails?.poster_path ? getTmdbPosterUrl(film.tmdbDetails.poster_path, 'w342') : null
    ).filter(url => url !== null);

    console.log('Debug: URLs de pôster geradas:', posterUrls);

    if (posterUrls.length > 0) {
        const posterBuffers = await Promise.all(
            posterUrls.map(async url => {
                try {
                    console.log(`Debug: Baixando pôster de: ${url}`);
                    const response = await axios.get(url, { responseType: 'arraybuffer' });
                    console.log(`Debug: Pôster baixado com sucesso: ${url}`);
                    return response.data;
                } catch (error) {
                    console.error(`Erro CRÍTICO ao baixar pôster de ${url}:`, error.message);
                    return sharp({
                        create: {
                            width: 342,
                            height: 513,
                            channels: 4,
                            background: { r: 100, g: 100, b: 100, alpha: 1 }
                        }
                    })
                    .png()
                    .toBuffer();
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


        const compositeImages = [];
        for (let i = 0; i < posterBuffers.length; i++) {
            const row = Math.floor(i / 2);
            const col = i % 2;
            compositeImages.push({
                input: posterBuffers[i],
                left: col * (posterWidth + gap),
                top: row * (posterHeight + gap)
            });
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

            attachment = new AttachmentBuilder(combinedImageBuffer, { name: 'favorites_grid.png' });
            console.log('Debug: Imagem da grade composta com sucesso!');
            console.log(`Debug: embed.data.image após processamento: ${embed.data.image ? JSON.stringify(embed.data.image) : 'NÃO DEFINIDO'}`);

        } catch (sharpError) {
            console.error('Erro ao compor a imagem com sharp:', sharpError.message);
            imageFailureMessage = 'Houve um erro ao gerar a imagem da grade de pôsteres.';
            attachment = null;
        }
    } else {
        imageFailureMessage = 'Não foi possível obter as URLs dos pôsteres dos filmes favoritos do TMDB.';
        console.log('Debug: posterUrls.length é 0, não há URLs para baixar.');
    }

    if (imageFailureMessage) {
        embed.setDescription((embed.description || '') + `\n\n${imageFailureMessage}`);
    }

    embed.setFooter(null);

    return { embed, attachment };
}

/**
 * Cria um embed com uma grade XxY de pôsteres de filmes curtidos.
 * Esta função é adaptada da createFavoritesEmbed para permitir colunas e linhas dinâmicas.
 * @param {Array<Object>} films Array de objetos de filmes com title, year, posterUrl (TMDB).
 * @param {string} username Nome de usuário do Letterboxd.
 * @param {number} cols Número de colunas da grade.
 * @param {number} rows Número de linhas da grade.
 * @returns {Promise<Object>} Um objeto contendo o EmbedBuilder e o AttachmentBuilder (a imagem).
 */
async function createLikesGridImage(films, username, cols, rows) {
    const embed = new EmbedBuilder()
        .setColor(0x00BFFF) // Cor azul claro para Likes Grid
        .setTitle(`Grade de Filmes Curtidos de ${username} (${cols}x${rows}) ❤️`);

    let attachment = null;
    let imageFailureMessage = '';

    const filmListDescription = films.map((film, index) =>
        `${index + 1}. **${film.title}** (${film.year || 'Ano Desconhecido'})`
    ).join('\n');
    embed.setDescription(filmListDescription);

    const posterUrls = films.map(film =>
        film.posterUrl ? film.posterUrl : null
    ).filter(url => url !== null);

    const requiredPosters = cols * rows;
    if (posterUrls.length < requiredPosters) {
        imageFailureMessage = `Não foi possível obter pôsteres suficientes (${posterUrls.length}/${requiredPosters}) para a grade ${cols}x${rows}.`;
        console.warn(`[Embed - LikesGrid] ${imageFailureMessage}`);
        while (posterUrls.length < requiredPosters) {
            posterUrls.push('https://via.placeholder.com/342x513?text=Poster+Faltando');
        }
    }


    if (posterUrls.length > 0) {
        const posterBuffers = await Promise.all(
            posterUrls.map(async url => {
                try {
                    const response = await axios.get(url, { responseType: 'arraybuffer' });
                    return response.data;
                } catch (error) {
                    console.error(`Erro ao baixar pôster de ${url}:`, error.message);
                    return sharp({
                        create: {
                            width: 342,
                            height: 513,
                            channels: 4,
                            background: { r: 50, g: 50, b: 50, alpha: 1 }
                        }
                    })
                    .png()
                    .toBuffer();
                }
            })
        );

        const posterWidth = 342;
        const posterHeight = 513;
        const gap = 10;

        const outputWidth = cols * posterWidth + (cols - 1) * gap;
        const outputHeight = rows * posterHeight + (rows - 1) * gap;

        const compositeImages = [];
        for (let i = 0; i < posterBuffers.length; i++) {
            const row = Math.floor(i / cols);
            const col = i % cols;
            compositeImages.push({
                input: posterBuffers[i],
                left: col * (posterWidth + gap),
                top: row * (posterHeight + gap)
            });
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

            attachment = new AttachmentBuilder(combinedImageBuffer, { name: `likes_grid_${cols}x${rows}.png` });

        } catch (sharpError) {
            console.error('Erro ao compor a imagem da grade com sharp:', sharpError.message);
            imageFailureMessage = 'Houve um erro ao gerar a imagem da grade de pôsteres.';
            attachment = null;
        }
    } else {
        imageFailureMessage = 'Não foi possível obter URLs de pôsteres para os filmes.';
    }

    if (imageFailureMessage) {
        embed.setDescription((embed.description || '') + `\n\n${imageFailureMessage}`);
    }

    embed.setFooter(null);

    return { embed, attachment };
}

/**
 * Cria um embed formatado para exibir as estatísticas do perfil de um usuário Letterboxd.
 * @param {Object} profileStats Objeto com as estatísticas do perfil (do getProfileStats.js).
 * @param {string} username O nome de usuário do Letterboxd.
 * @returns {EmbedBuilder} O Embed formatado.
 */
async function createProfileEmbed(profileStats, username) {
    const embed = new EmbedBuilder()
        .setColor(0xFFFFFF) // Cor branca (0xFFFFFF)
        .setTitle(`Perfil Letterboxd de ${username}`)
        .setURL(profileStats.profileUrl) // Link para o perfil no Letterboxd
        .setThumbnail(profileStats.userAvatarUrl || null); // Adiciona o avatar como thumbnail, se existir

    // Remover rodapé
    embed.setFooter(null);

    const fields = [];

    // Filmes Assistidos (Total) e Filmes Este Ano - Lado a lado
    if (profileStats.totalFilmsWatched !== 'N/A') {
        fields.push({
            name: '🎬 Filmes Assistidos:',
            value: profileStats.totalFilmsWatched,
            inline: true
        });
    }
    if (profileStats.filmsThisYear !== 'N/A') {
        fields.push({
            name: '📅 Filmes Este Ano:',
            value: profileStats.filmsThisYear,
            inline: true
        });
    }
    // Adicionar um campo vazio para forçar uma nova linha
    // Verificar se pelo menos um dos campos do grupo foi adicionado
    if (profileStats.totalFilmsWatched !== 'N/A' || profileStats.filmsThisYear !== 'N/A') {
        fields.push({ name: '\u200b', value: '\u200b', inline: false }); // Campo invisível NÃO INLINE
    }


    // Seguindo e Seguidores - Lado a lado
    if (profileStats.following !== 'N/A') {
        fields.push({
            name: '🤝 Seguindo:',
            value: profileStats.following,
            inline: true
        });
    }
    if (profileStats.followers !== 'N/A') {
        fields.push({
            name: '👥 Seguidores:',
            value: profileStats.followers,
            inline: true
        });
    }
    // Adicionar um campo vazio para forçar uma nova linha
    if (profileStats.following !== 'N/A' || profileStats.followers !== 'N/A') {
        fields.push({ name: '\u200b', value: '\u200b', inline: false });
    }

    // Watchlist e Tags Usadas - Lado a lado
    if (profileStats.watchlistCount !== 'N/A') {
        fields.push({
            name: '👀 Watchlist:',
            value: profileStats.watchlistCount,
            inline: true
        });
    }
    if (profileStats.tagsList && profileStats.tagsList.length > 0) {
        fields.push({
            name: '🏷️ Tags Usadas:',
            value: profileStats.tagsList.join(', '),
            inline: true
        });
    } else if (profileStats.tagsList && profileStats.tagsList.length === 0) {
        fields.push({
            name: '🏷️ Tags Usadas:',
            value: 'Nenhuma',
            inline: true
        });
    }
    // Não precisa de campo vazio final.


    if (fields.length > 0) {
        embed.addFields(fields);
    } else {
        embed.setDescription('Não foi possível obter as estatísticas do perfil.');
    }

    return { embed };
}

// --- BLOCO FINAL DE EXPORTAÇÃO DE TODAS AS FUNÇÕES ---
// Todas as funções declaradas acima são exportadas aqui.
export {
    createDiaryEmbed,
    createReviewEmbed,
    createDailyDiaryEmbed,
    createFavoritesEmbed,
    createLikesGridImage,
    createProfileEmbed,
    formatDateBr,
    convertRatingToStars
};