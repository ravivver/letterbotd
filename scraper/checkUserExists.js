// scraper/checkUserExists.js
import axios from 'axios';
// import cheerio from 'cheerio'; // Linha incorreta que causou o erro
import * as cheerio from 'cheerio'; // Linha correta

export async function checkUserExists(username) {
  const url = `https://letterboxd.com/${username}/`;
  
  try {
    const { data } = await axios.get(url, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
    });
    // O resto do código não muda, pois a forma de usar cheerio.load() continua a mesma
    const $ = cheerio.load(data);

    if ($('body').text().includes('This account is private')) {
      return { status: 'PRIVATE', message: 'Este perfil do Letterboxd é privado e não pode ser vinculado.' };
    }

    return { status: 'SUCCESS', message: 'Usuário encontrado.' };

  } catch (error) {
    if (error.response && error.response.status === 404) {
      return { status: 'NOT_FOUND', message: `O nome de usuário \`${username}\` não foi encontrado no Letterboxd.` };
    }
    
    console.error(`Erro ao verificar o usuário '${username}' no Letterboxd:`, error.message);
    return { status: 'ERROR', message: 'Ocorreu um erro externo ao tentar verificar o usuário.' };
  }
}