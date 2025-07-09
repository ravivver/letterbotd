// scraper/getFilmDetails.js

import axios from 'axios';
import * as cheerio from 'cheerio';

/**
 * Scrapeia detalhes de um filme específico a partir de sua página no Letterboxd.
 * @param {string} filmSlug O slug do filme (ex: "eyes-wide-shut").
 * @returns {Promise<Object|null>} Um objeto com os detalhes do filme, ou null se não for encontrado/erro.
 */
async function getFilmDetails(filmSlug) {
    if (!filmSlug) {
        throw new Error('Film slug é obrigatório.');
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

        // --- Verificações de Erro na Página ---
        const pageTitle = $('title').text();
        const mainContent = $('#content').text();
        if (pageTitle.includes('Page Not Found') || mainContent.includes('The page you were looking for doesn\'t exist')) {
            throw new Error(`Filme '${filmSlug}' não encontrado.`);
        }
        if (response.status === 404) {
             throw new Error(`A página do filme '${filmSlug}' retornou um erro 404 inesperado.`);
        }
        // --- Fim das Verificações de Erro na Página ---


        // Extraindo Pôster de Alta Resolução - **NOVA ESTRATÉGIA!**
        let highResPosterUrl = null;
        // 1. Tenta pegar a imagem com alta resolução diretamente da tag <img> dentro do modal (se for visível no HTML inicial)
        const modalImgSrc = $('#poster-modal .modal-body .poster img.image').attr('src');
        const modalImgSrcset = $('#poster-modal .modal-body .poster img.image').attr('srcset');

        if (modalImgSrcset) { // Prioriza srcset se disponível
            const urls = modalImgSrcset.split(',').map(s => s.trim().split(' ')[0]);
            if (urls.length > 0) highResPosterUrl = urls[urls.length - 1]; // Pega a maior resolução
        }
        if (!highResPosterUrl && modalImgSrc) { // Fallback para src
            highResPosterUrl = modalImgSrc;
        }

        // 2. Fallback para a URL do 'data-js-trigger="postermodal"' e tenta construir
        if (!highResPosterUrl) {
            const posterModalLinkHref = $('a[data-js-trigger="postermodal"]').attr('href');
            if (posterModalLinkHref) {
                // Remove o final /image-XXX/ e tenta pegar a URL base, ou uma de maior resolução
                // Ex: /film/eyes-wide-shut/image-150/ -> https://letterboxd.com/film/eyes-wide-shut/
                // E daí tentar construir uma imagem maior se o padrão for conhecido
                highResPosterUrl = `https://letterboxd.com${posterModalLinkHref.replace(/\/image-\d+\/$/, '/')}`;
                // Poderíamos tentar adicionar 'poster-1000.jpg' ou similar, mas é especulativo.
            }
        }
        // console.log(`Debug Pôster: ${highResPosterUrl}`);


        // Extraindo URL do Backdrop (Background)
        let backdropUrl = null;
        const backdropDiv = $('#backdrop');
        if (backdropDiv.length) {
            backdropUrl = backdropDiv.attr('data-backdrop');
        }
        // console.log(`Debug Backdrop: ${backdropUrl}`);


        // Extraindo Número de Likes do Filme (Contagem Exata) - CORRIGIDO!
        let filmLikesCount = null;
        const likesTooltipElement = $('.production-statistic.-likes a.tooltip'); // O <a> tem o data-original-title
        if (likesTooltipElement.length) {
            const originalTitle = likesTooltipElement.attr('data-original-title');
            if (originalTitle) {
                const match = originalTitle.match(/Liked by ([\d,]+)/);
                if (match && match[1]) {
                    filmLikesCount = match[1].replace(/,/g, ''); // Remove vírgulas
                }
            }
        }
        // console.log(`Debug Likes: ${filmLikesCount}`);


        // Extraindo Número de Watches (Assistidos) do Filme (Contagem Exata) - CORRIGIDO!
        let filmWatchesCount = null;
        const watchesTooltipElement = $('.production-statistic.-watches a.tooltip');
        if (watchesTooltipElement.length) {
            const originalTitle = watchesTooltipElement.attr('data-original-title');
            if (originalTitle) {
                const match = originalTitle.match(/Watched by ([\d,]+)/);
                if (match && match[1]) {
                    filmWatchesCount = match[1].replace(/,/g, ''); // Remove vírgulas
                }
            }
        }
        // console.log(`Debug Watches: ${filmWatchesCount}`);

        
        // Extraindo Diretor do filme
        let director = null;
        const directorElement = $('p.credits span.creatorlist a span.prettify');
        if (directorElement.length) {
            director = directorElement.text().trim();
        }
        // console.log(`Debug Diretor: ${director}`);


        // Extraindo Média de Rating e Contagem de Ratings - CORRIGIDO!
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
        // console.log(`Debug Rating: ${averageRating} (${ratingsCount})`);


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
            throw new Error('Não foi possível conectar ao Letterboxd para buscar detalhes do filme. Verifique sua conexão com a internet.');
        }
        if (error.message.includes('Filme') || error.message.includes('404')) {
            throw error;
        }
        console.error(`Erro inesperado ao raspar detalhes do filme '${filmSlug}':`, error.message);
        throw new Error(`Ocorreu um erro inesperado ao buscar detalhes do filme '${filmSlug}'. Tente novamente mais tarde.`);
    }
}

export default getFilmDetails;