import getRecentReviews from './scraper/getReview.js'; // Caminho CORRETO

async function test() {
    try {
        const username = 'gvnxzn'; // Use o nome de usuário que tem muitas páginas de review
        console.log(`Iniciando teste para ${username}...`);
        const reviews = await getRecentReviews(username);
        console.log(`Total de reviews encontradas para ${username}: ${reviews.length}`);

        // Verifique se "Scream" aparece agora:
        const screamReviews = reviews.filter(r => r.filmTitle.toLowerCase().includes('scream'));
        console.log(`Reviews de "Scream" encontradas:`, screamReviews.map(r => r.filmTitle + ' (' + r.filmYear + ') - ' + r.reviewUrl));

        // Para verificar o funcionamento da paginação, você pode testar com usuários que têm poucas reviews também.
        // Ex: const username2 = 'usuario_com_poucas_reviews';
        // const reviews2 = await getRecentReviews(username2);
        // console.log(`Total de reviews encontradas para ${username2}: ${reviews2.length}`);

    } catch (error) {
        console.error("Erro no teste:", error.message);
    }
}

test();