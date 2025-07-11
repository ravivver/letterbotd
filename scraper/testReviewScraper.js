// scraper/testReviewScraper.js
import axios from 'axios';
import * as cheerio from 'cheerio';

/**
 * Testa a extração de review de uma página de atividade/visualização específica do Letterboxd.
 * @param {string} username O nome de usuário do Letterboxd.
 * @param {string} viewingId O ID da visualização (data-viewing-id) para a entrada do diário.
 */
export async function testReviewScraper(username, viewingId) {
    const url = `https://letterboxd.com/${username}/activity/${viewingId}/`;
    const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    };

    console.log(`\n--- INICIANDO TESTE DE REVIEW SCRAPER ---`);
    console.log(`URL de teste: ${url}`);

    try {
        const { data } = await axios.get(url, { headers });
        const $ = cheerio.load(data);

        // O seletor que estamos usando para detectar a review
        const reviewElement = $('div.review.body-text'); 
        
        console.log(`Verificando se o elemento 'div.review.body-text' existe...`);

        if (reviewElement.length > 0) {
            console.log(`STATUS: Review encontrada!`);
            console.log(`Número de elementos encontrados: ${reviewElement.length}`);
            
            // Imprime o HTML do primeiro elemento de review encontrado
            console.log(`\n--- HTML DA REVIEW ENCONTRADA ---`);
            console.log($.html(reviewElement.first()));
            console.log(`--- FIM DO HTML DA REVIEW ENCONTRADA ---\n`);

            // Tenta extrair o texto da review
            const reviewText = reviewElement.first().text().trim();
            console.log(`Texto da Review (primeiros 200 caracteres):`);
            console.log(reviewText.substring(0, 200) + (reviewText.length > 200 ? '...' : ''));

        } else {
            console.log(`STATUS: Nenhuma review encontrada com o seletor 'div.review.body-text'.`);
            console.log(`\n--- HTML DA PÁGINA (PARTE RELEVANTE) ---`);
            // Tenta imprimir uma seção maior para ver onde a review poderia estar
            // Por exemplo, o conteúdo da tag <section> principal ou <body>
            const mainContent = $('body').html(); // Ou $('section.film-viewing-info-wrapper').parent().html() se for mais específico
            console.log(mainContent ? mainContent.substring(0, 1000) + '...' : 'Não foi possível obter HTML relevante.');
            console.log(`--- FIM DO HTML DA PÁGINA ---\n`);
        }

    } catch (error) {
        console.error(`Erro ao buscar a URL de teste: ${error.message}`);
        if (error.response) {
            console.error(`Status HTTP: ${error.response.status}`);
        }
    }
    console.log(`--- FIM DO TESTE DE REVIEW SCRAPER ---\n`);
}

// Exemplo de como usar (descomente e substitua os valores para testar):
testReviewScraper('157', '942942929');
testReviewScraper('157', '942078398');
