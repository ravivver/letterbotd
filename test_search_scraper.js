// test_search_scraper.js (Versão de Depuração Profunda)
import axios from 'axios';

async function runDeepDiveTest() {
  console.log('Iniciando teste de busca PROFUNDO...');
  const query = 'stanley kubrick';
  const formattedQuery = encodeURIComponent(query);

  const filmUrl = `https://letterboxd.com/s/search/films/${formattedQuery}/`;
  const personUrl = `https://letterboxd.com/s/search/cast-crew/${formattedQuery}/`;
  
  const headers = {
    'X-Requested-With': 'XMLHttpRequest',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
  };

  console.log(`\nBuscando em (FILMES): ${filmUrl}`);
  console.log(`Buscando em (PESSOAS): ${personUrl}\n`);

  try {
    // Vamos fazer as requisições separadamente para depurar melhor
    
    // --- Requisição de FILMES ---
    console.log('\n\n--- [INICIANDO DEBUG] Resposta de /films/ ---');
    const filmResponse = await axios.get(filmUrl, { headers });
    console.log(`[FILMES] Status: ${filmResponse.status}`);
    console.log(`[FILMES] Content-Type Header: ${filmResponse.headers['content-type']}`);
    console.log('[FILMES] Corpo (Data):');
    console.log(JSON.stringify(filmResponse.data, null, 2));
    console.log('--- [FIM DEBUG] /films/ ---\n\n');

  } catch (error) {
    console.error('\n--- ERRO NA REQUISIÇÃO DE FILMES ---');
    if (error.response) {
      console.error(`Status: ${error.response.status}`);
      console.error('Data:', JSON.stringify(error.response.data, null, 2));
    } else {
      console.error('Erro na requisição:', error.message);
    }
    console.error('--- FIM DO ERRO DE FILMES ---\n');
  }

  try {
    // --- Requisição de PESSOAS ---
    console.log('\n\n--- [INICIANDO DEBUG] Resposta de /cast-crew/ ---');
    const personResponse = await axios.get(personUrl, { headers });
    console.log(`[PESSOAS] Status: ${personResponse.status}`);
    console.log(`[PESSOAS] Content-Type Header: ${personResponse.headers['content-type']}`);
    console.log('[PESSOAS] Corpo (Data):');
    console.log(JSON.stringify(personResponse.data, null, 2));
    console.log('--- [FIM DEBUG] /cast-crew/ ---');

  } catch (error) {
    console.error('\n--- ERRO NA REQUISIÇÃO DE PESSOAS ---');
    if (error.response) {
      console.error(`Status: ${error.response.status}`);
      console.error('Data:', JSON.stringify(error.response.data, null, 2));
    } else {
      console.error('Erro na requisição:', error.message);
    }
    console.error('--- FIM DO ERRO DE PESSOAS ---');
  }
}

runDeepDiveTest();