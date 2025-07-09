// scraper/getFilmDetailsFromSlug.js

import axios from 'axios';
import * as cheerio from 'cheerio';

/**
 * Raspa detalhes de um filme a partir de sua página no Letterboxd usando o slug.
 * @param {string} filmSlug O slug do filme (ex: "scarface-1983").
 * @returns {Promise<Object>} Objeto com title, year, posterUrlLetterboxd.
 * Retorna null se o filme não for encontrado ou se os dados essenciais não forem extraídos.
 */
async function getFilmDetailsFromSlug(filmSlug) {
    if (!filmSlug) {
        console.error("[Scraper - FilmDetails] Erro: Slug do filme é obrigatório.");
        return null;
    }

    const url = `https://letterboxd.com/film/${filmSlug}/`;
    console.log(`[Scraper - FilmDetails] Buscando detalhes para slug: ${filmSlug} na URL: ${url}`);

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

        // --- Verificações de Erro na Página do Filme ---
        const pageTitleMeta = $('meta[property="og:title"]').attr('content');
        if (pageTitleMeta && (pageTitleMeta.includes('Page Not Found') || pageTitleMeta.includes('404'))) {
            console.log(`[Scraper - FilmDetails] Filme com slug "${filmSlug}" não encontrado (via og:title ou 404).`);
            return null;
        }
        if (response.status === 404) {
            console.log(`[Scraper - FilmDetails] Filme com slug "${filmSlug}" não encontrado (status 404).`);
            return null;
        }
        // --- Fim das Verificações de Erro ---

        let title = null;
        let year = null;

        // --- TÍTULO: Usando o seletor fornecido ---
        // Ele geralmente está dentro de um h1.
        title = $('h1 .name.prettify').text().trim();
        // Fallback para meta tag se o seletor acima falhar, pois é um fallback seguro para o título geral.
        if (!title) {
            const ogTitle = $('meta[property="og:title"]').attr('content');
            if (ogTitle) {
                const match = ogTitle.match(/^(.*)\s\((\d{4})\)$/);
                if (match) {
                    title = match[1].trim();
                } else {
                    title = ogTitle.trim();
                }
            }
        }
        
        // --- ANO: Usando o seletor fornecido ---
        const yearElement = $('span.releasedate a');
        if (yearElement.length) {
            const yearText = yearElement.text().trim();
            const parsedYear = parseInt(yearText);
            if (!isNaN(parsedYear)) {
                year = parsedYear;
            } else {
                console.log(`[Scraper - FilmDetails] Ano inválido encontrado para "${filmSlug}": ${yearText}`);
            }
        } else {
            console.log(`[Scraper - FilmDetails] Elemento de ano (span.releasedate a) NÃO encontrado para "${filmSlug}".`);
        }

        // Fallback para ano do og:title (se o og:title tinha o ano e não pegamos antes)
        if (year === null) {
             const ogTitle = $('meta[property="og:title"]').attr('content');
            if (ogTitle) {
                const match = ogTitle.match(/\((\d{4})\)$/); // Procura por (YYYY) no final
                if (match) {
                    const parsedYear = parseInt(match[1]);
                    if (!isNaN(parsedYear)) {
                        year = parsedYear;
                        console.log(`[Scraper - FilmDetails] Ano ${year} extraído do og:title (fallback).`);
                    }
                }
            }
        }


        // URL do Pôster (do background-image do div principal ou da tag img)
        let posterUrlLetterboxd = null;
        const posterDiv = $('.film-poster.poster'); // O container principal do pôster
        if (posterDiv.length) {
            const style = posterDiv.attr('style'); // ex: background-image: url("https://a.ltrbxd.com/resized/film-poster/...");
            if (style && style.includes('background-image')) {
                const urlMatch = style.match(/url\("(.+)"\)/);
                if (urlMatch && urlMatch[1]) {
                    posterUrlLetterboxd = urlMatch[1];
                }
            }
        }
        // Fallback: img tag dentro do film-poster (se não for background-image)
        if (!posterUrlLetterboxd) {
            const imgElement = $('.film-poster img.image');
            if (imgElement.length) {
                posterUrlLetterboxd = imgElement.attr('src');
            }
        }

        if (!title || year === null) { // Se não conseguiu pegar título ou ano, algo está errado
             console.log(`[Scraper - FilmDetails] Falha ao extrair título ou ano essencial para "${filmSlug}". Título: "${title}", Ano: ${year}`);
             return null;
        }


        console.log(`[Scraper - FilmDetails] Detalhes para "${filmSlug}": Título: "${title}", Ano: ${year}, Pôster LB: ${posterUrlLetterboxd ? 'Encontrado' : 'Não encontrado'}`);

        return {
            title,
            year,
            posterUrlLetterboxd, // Esta URL é do Letterboxd, para uso interno se necessário
            slug: filmSlug // Manter o slug
        };

    } catch (error) {
        console.error(`Erro inesperado ao buscar detalhes do filme "${filmSlug}":`, error.message);
        return null; // Retorna null em caso de erro para não quebrar o processo principal
    }
}

export default getFilmDetailsFromSlug;