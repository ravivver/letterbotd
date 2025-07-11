// scraper/checkUserExists.js
import axios from 'axios';
import * as cheerio from 'cheerio';

export async function checkUserExists(username) {
  const url = `https://letterboxd.com/${username}/`;
  
  try {
    const { data } = await axios.get(url, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
    });
    const $ = cheerio.load(data);

    if ($('body').text().includes('This account is private')) {
      return { status: 'PRIVATE', message: 'This Letterboxd profile is private and cannot be linked.' }; // Translated
    }

    return { status: 'SUCCESS', message: 'User found.' }; // Translated

  } catch (error) {
    if (error.response && error.response.status === 404) {
      return { status: 'NOT_FOUND', message: `The username \`${username}\` was not found on Letterboxd.` }; // Translated
    }
    
    console.error(`Error checking user '${username}' on Letterboxd:`, error.message); // Translated
    return { status: 'ERROR', message: 'An external error occurred while trying to check the user.' }; // Translated
  }
}
