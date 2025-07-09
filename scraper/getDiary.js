// scraper/getDiary.js

import axios from 'axios';
import * as cheerio from 'cheerio';

/**
 * Scrapeia os filmes assistidos recentemente do diário de um usuário do Letterboxd.
 * Retorna uma lista de filmes encontrados na primeira página do diário.
 *
 * @param {string} username O nome de usuário do Letterboxd.
 * @returns {Promise<Array<Object>>} Uma array de objetos, cada um com os detalhes de um filme assistido.
 * Retorna uma array vazia se nenhum filme for encontrado ou em caso de erros específicos.
 * @throws {Error} Lança um erro se o usuário não for encontrado ou o perfil for privado.
 */
async function getRecentDiaryEntries(username) { // Sem parâmetros de data aqui
    if (!username) {
        throw new Error('Nome de usuário do Letterboxd é obrigatório.');
    }

    const url = `https://letterboxd.com/${username}/films/diary/`; // URL sempre da página principal
    const films = [];
    let currentMonth = '';
    let currentYear = '';

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

        if (mainContent.includes('Sorry, we can’t find the page you’ve requested.')) { 
            throw new Error('Usuário Letterboxd não encontrado.'); 
        }
        
        if (pageTitle.includes('Profile is Private') || mainContent.includes('This profile is private')) {
             throw new Error('Perfil Letterboxd é privado. Não é possível acessar o diário.');
        }

        if (response.status === 404) {
             throw new Error('A página do Letterboxd retornou um erro 404 inesperado.');
        }
        // --- Fim das Verificações de Erro na Página ---

        $('.diary-entry-row').each((i, element) => {
            const entry = $(element);

            // A lógica de `currentMonth` e `currentYear` precisa ser robusta para logs agrupados
            const monthElementInFlag = entry.find('.td-calendar .date strong a');
            const yearElementInFlag = entry.find('.td-calendar .date small');

            // Se há uma nova bandeira de mês/ano, atualiza
            if (monthElementInFlag.length && yearElementInFlag.length) {
                currentMonth = monthElementInFlag.text().trim();
                currentYear = yearElementInFlag.text().trim();
            } else if (monthElementInFlag.length && !yearElementInFlag.length) {
                // Se só tem o mês, mas não o ano (ex: "Jul" sem "2025"), usa o ano atual ou o último 'currentYear'
                currentMonth = monthElementInFlag.text().trim();
                if (!currentYear) { // Se currentYear ainda não foi definido (primeira entrada)
                    // Tenta inferir o ano da URL da bandeira, se necessário
                    const urlPath = monthElementInFlag.attr('href');
                    const yearMatch = urlPath ? urlPath.match(/\/(\d{4})\/$/) : null;
                    if (yearMatch) currentYear = yearMatch[1];
                    else currentYear = String(new Date().getFullYear()); // Fallback para ano atual
                }
            } else if (!currentMonth || !currentYear) { // Se não há bandeira e é a primeira entrada do scrape, tenta inferir
                 // Isso é um caso limite se a primeira entrada da página não tem uma bandeira
                 // Por padrão, se não pegou nada, use o mês/ano da data completa do item
                 // Mas a lógica de `currentMonth` e `currentYear` deve garantir que eles tenham um valor após o primeiro item
                 const fullDateAttr = entry.find('time.timestamp').attr('datetime'); // Ex: "2025-07-09T00:00:00.000Z"
                 if (fullDateAttr) {
                    const d = new Date(fullDateAttr);
                    currentYear = String(d.getFullYear());
                    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
                    currentMonth = monthNames[d.getMonth()];
                 }
            }
            
            const filmTitle = entry.find('h2.name.prettify a').text().trim();
            const filmYearText = entry.find('.releasedate a').text().trim();
            const filmYear = filmYearText ? parseInt(filmYearText) : null;

            const dayNumber = entry.find('.td-day a').text().trim();
            const watchedDateText = `${currentMonth} ${dayNumber}`.trim(); 
            const loggedYear = currentYear ? parseInt(currentYear) : null;

            let watchedDateFull = null;
            if (currentMonth && dayNumber && loggedYear) {
                const monthMap = { 'Jan': '01', 'Feb': '02', 'Mar': '03', 'Apr': '04', 'May': '05', 'Jun': '06', 
                                   'Jul': '07', 'Aug': '08', 'Sep': '09', 'Oct': '10', 'Nov': '11', 'Dec': '12' }; 
                const monthNum = monthMap[currentMonth];
                if (monthNum) {
                    watchedDateFull = `${loggedYear}-${monthNum}-${dayNumber.padStart(2, '0')}`;
                }
            }
            
            const ratingInput = entry.find('.td-rating input.rateit-field');
            let rating = null;
            if (ratingInput.length) {
                const dataRating = parseInt(ratingInput.val());
                if (!isNaN(dataRating)) {
                    rating = dataRating / 2;
                }
            } else { 
                const ratingValueElement = entry.find('.td-rating .rateit-range');
                if (ratingValueElement.length) {
                    const dataRating = parseInt(ratingValueElement.attr('aria-valuenow'));
                    if (!isNaN(dataRating)) {
                        rating = dataRating / 2;
                    }
                }
            }
            
            const filmLinkElement = entry.find('h2.name.prettify a');
            const filmUrl = `https://letterboxd.com` + filmLinkElement.attr('href');
            const filmSlugMatch = filmUrl.match(/\/film\/([a-zA-Z0-9-]+)\//);
            const filmSlug = filmSlugMatch ? filmSlugMatch[1] : null;

            films.push({
                username: username,
                title: filmTitle,
                year: filmYear,
                url: filmUrl, 
                watchedDate: watchedDateText,
                watchedDateFull: watchedDateFull, // Esta é a chave para a filtragem!
                loggedYear: loggedYear,
                rating: rating,
                filmSlug: filmSlug 
            });
        });

        if (films.length === 0) {
            console.log(`Debug: Nenhuma entrada de diário encontrada para "${username}".`);
        }

        return films;

    } catch (error) {
        if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED' || error.code === 'UND_ERR_SOCKET') {
            throw new Error('Não foi possível conectar ao Letterboxd. Verifique sua conexão com a internet.');
        }
        if (error.message.includes('Ocorreu um erro ao acessar o Letterboxd deste usuário.')) {
            throw error; 
        }
        console.error(`Erro inesperado ao raspar diário do usuário ${username}:`, error.message);
        throw new Error(`Ocorreu um erro inesperado ao buscar o diário de ${username}. Tente novamente mais tarde. Detalhes: ${error.message}`);
    }
}

export default getRecentDiaryEntries;