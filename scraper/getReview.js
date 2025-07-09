// scraper/getReview.js

import axios from 'axios';
import * as cheerio from 'cheerio';

/**
 * Scrapeia as reviews de todas as páginas de um usuário do Letterboxd.
 * @param {string} username O nome de usuário do Letterboxd.
 * @returns {Promise<Array<Object>>} Uma array de objetos, cada um com os detalhes de uma review.
 * Retorna uma array vazia se nenhuma review for encontrada, o perfil for privado ou o usuário não existir.
 */
async function getRecentReviews(username) {
    if (!username) {
        throw new Error('Nome de usuário do Letterboxd é obrigatório.');
    }

    let allReviews = [];
    let currentPage = 1;
    let hasNextPage = true; // Assumimos que há uma primeira página para começar

    try {
        // --- LOOP PRINCIPAL PARA PEGAR TODAS AS PÁGINAS ---
        while (hasNextPage) {
            const url = `https://letterboxd.com/${username}/films/reviews/page/${currentPage}/`;
            console.log(`[Scraper - Reviews] Buscando reviews da página ${currentPage} para ${username}...`); // Para depuração

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

            if (mainContent.includes('Sorry, we can’t find the page you’ve requested.')) {
                // Se for a primeira página e der 404, o usuário não existe.
                if (currentPage === 1) {
                    throw new Error('Usuário Letterboxd não encontrado.');
                } else {
                    // Se der 404 em uma página subsequente, significa que não há mais páginas.
                    hasNextPage = false;
                    break;
                }
            }

            if (pageTitle.includes('Profile is Private') || mainContent.includes('This profile is private')) {
                throw new Error('Perfil Letterboxd é privado. Não é possível acessar as reviews.');
            }

            if (response.status === 404 && currentPage === 1) {
                throw new Error('A página do Letterboxd retornou um erro 404 inesperado na primeira tentativa.');
            }
            // --- Fim das Verificações de Erro na Página ---

            // Seleciona todas as entradas de review na página atual
            const reviewElements = $('.listitem.js-listitem article.production-viewing');

            if (!reviewElements.length && currentPage === 1) {
                // Nenhuma review encontrada na primeira página e sem mais páginas esperadas
                return [];
            } else if (!reviewElements.length && currentPage > 1) {
                // Se não há elementos de review em uma página subsequente, pode ter chegado ao fim
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

            // --- LÓGICA DE PAGINAÇÃO BASEADA NOS BOTÕES "Newer" e "Older" ---
            const nextButton = $('.pagination .next'); // Seletor para o botão "Older"
            const prevButton = $('.pagination .previous'); // Seletor para o botão "Newer"

            if (nextButton.length > 0) {
                // Se o botão "Older" existe, há mais páginas.
                currentPage++;
                hasNextPage = true;
            } else if (prevButton.length > 0 && nextButton.length === 0) {
                // Se só existe o botão "Newer" (e não o "Older"), significa que é a última página.
                hasNextPage = false;
            } else {
                // Se não há botões de paginação, é uma página única ou não há reviews.
                hasNextPage = false;
            }

            // *** DELAY PARA NÃO SOBRECARREGAR O SERVIDOR DO LETTERBOXD ***
            if (hasNextPage) { // Apenas adiciona delay se houver uma próxima página para buscar
                await new Promise(resolve => setTimeout(resolve, 1000)); // Espera 1 segundo
            }
        }

        return allReviews;

    } catch (error) {
        if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED' || error.code === 'UND_ERR_SOCKET') {
            throw new Error('Não foi possível conectar ao Letterboxd. Verifique sua conexão com a internet.');
        }
        if (error.message.includes('Perfil Letterboxd é privado') || error.message.includes('Usuário Letterboxd não encontrado')) {
            throw error;
        }
        console.error(`Erro inesperado ao raspar reviews do usuário ${username}:`, error.message);
        throw new Error(`Ocorreu um erro inesperado ao buscar as reviews de ${username}. Tente novamente mais tarde. Detalhes: ${error.message}`);
    }
}

export default getRecentReviews;