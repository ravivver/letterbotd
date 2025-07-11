// utils/formatEmbed.js

import { EmbedBuilder, AttachmentBuilder } from 'discord.js';
import { getTmdbPosterUrl } from '../api/tmdb.js';
import sharp from 'sharp'; // Usando sharp
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
    
    return stars;
}


// --- FUNÇÕES DE CRIAÇÃO DE EMBED ---

async function createDiaryEmbed(latestFilm, tmdbDetails, letterboxdUsername) {
    const embed = new EmbedBuilder()
        .setColor(0xFFFF00) // Amarelo
        .setURL(latestFilm.url);

    const embedTitle = `Último Filme de ${letterboxdUsername} �`;
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

async function createDailyDiaryEmbed(filmsDoDia, letterboxdUsername, displayDate) {
    const embed = new EmbedBuilder()
        .setColor(0x00FF00) // Uma cor verde para o diário diário, para diferenciar
        .setTitle(`Diário de ${letterboxdUsername} em ${displayDate} 🗓️`); // Título com a data

    let description = '';
    if (filmsDoDia.length > 0) {
        for (const filmData of filmsDoDia) {
            description += `**- ${filmData.title}** (${filmData.year})\n`;
            description += `  Nota: ${convertRatingToStars(filmData.rating)}\n`;
            if (filmData.tmdbDetails) {
                description += `  Gêneros (TMDB): ${filmData.tmdbDetails.genres?.join(', ') || 'N/A'}\n`;
            }
            description += `  [Ver no Letterboxd](${filmData.url})\n\n`;
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

async function createFavoritesEmbed(favoriteFilms, letterboxdUsername) {
    const embed = new EmbedBuilder()
        .setColor(0xFF00FF) // Uma cor vibrante para favoritos (ex: magenta)
        .setTitle(`Filmes Favoritos de ${letterboxdUsername} ❤️`);

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
                    console.error(`Erro ao baixar pôster de ${url}:`, error.message);
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
            console.error('Erro ao compor a imagem com sharp:', sharpError.message);
            imageFailureMessage = 'Houve um erro ao gerar a imagem da grade de pôsteres.';
            attachment = null;
        }
    } else {
        imageFailureMessage = 'Não foi possível obter os pôsteres dos filmes favoritos.';
    }

    if (imageFailureMessage) {
        embed.setDescription((embed.description || '') + `\n\n${imageFailureMessage}`);
    }

    return { embed, attachment };
}

// --- VERSÃO FINAL DA FUNÇÃO createLikesGridImage (AGORA GENÉRICA PARA GRADES) ---
/**
 * Cria um embed e uma imagem de grade para filmes.
 * Suporta hyperlinks e grades incompletas com fundo transparente.
 * Esta função será usada para "Likes" e "Filmes Assistidos".
 * @param {Array<Object>} films Array de objetos de filmes com slug, title, year, posterUrl.
 * @param {string} gridTitle O título da grade (ex: "Filmes Curtidos de X", "Filmes Assistidos Hoje por Y").
 * @param {number} cols Número de colunas.
 * @param {number} rows Número de linhas.
 * @returns {Promise<Object>} Um objeto contendo o EmbedBuilder e o AttachmentBuilder (a imagem).
 */
async function createGridImage(films, gridTitle, cols, rows) {
    const embed = new EmbedBuilder()
        .setColor(0x6f52e3) // Cor roxa
        .setTitle(`Grade de ${gridTitle}`); // Título dinâmico

    let attachment = null;
    const requiredFilms = cols * rows;

    // LÓGICA DE HYPERLINKS
    // Garante que title e year não sejam undefined no texto
    const filmListDescription = films
        .map((film, index) => `${index + 1}. **[${film.title || 'Filme Desconhecido'} (${film.year || '????'})](https://letterboxd.com/film/${film.slug}/)**`)
        .join('\n');
    embed.setDescription(filmListDescription);

    // Baixa os pôsteres. Se falhar ou for null, o resultado será null.
    // Preenche a lista com 'null' para os espaços que ficarão vazios
    const posterPromises = [];
    for (let i = 0; i < requiredFilms; i++) {
        const film = films[i]; // Pode ser undefined se houver menos filmes que requiredFilms
        if (film && film.posterUrl) {
            posterPromises.push(axios.get(film.posterUrl, { responseType: 'arraybuffer' })
                .then(response => response.data)
                .catch(error => {
                    console.error(`Erro ao baixar pôster para ${film.title} (${film.posterUrl}):`, error.message);
                    return null; // Trata erro de download como um espaço vazio
                })
            );
        } else {
            posterPromises.push(Promise.resolve(null)); // Para espaços vazios intencionais
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
        // Se o buffer for null (pôster ausente ou erro), não adicionamos nada para sharp
        // O fundo transparente já cuidará do espaço vazio.
    }
    
    try {
        const combinedImageBuffer = await sharp({
            create: {
                width: outputWidth,
                height: outputHeight,
                channels: 4,
                background: { r: 0, g: 0, b: 0, alpha: 0 } // Fundo totalmente transparente
            }
        })
        .composite(compositeImages)
        .png()
        .toBuffer();
        attachment = new AttachmentBuilder(combinedImageBuffer, { name: `grid_${cols}x${rows}.png` });
    } catch (sharpError) {
        console.error('Erro ao compor a imagem da grade com sharp:', sharpError.message);
        embed.setFooter({ text: 'Houve um erro ao gerar a imagem da grade.' });
    }

    return { embed, attachment };
}


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
    createGridImage, // Exporta a função genérica de grid
    createProfileEmbed,
    formatDateBr,
    convertRatingToStars
};
